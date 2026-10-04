import './style.css';
import { WORKLOADS, SYSTEMS, type SystemId, type Workload } from './workloads';
import { detectDevice, type DeviceInfo } from './device';
import { runNoir, runCircom, threadsAvailable, type CellResult } from './bench';
import { drawCard } from './card';

// ---------- types for reference data ----------
interface NativeRow {
  workload: string;
  system: string;
  prove_ms?: { median: number };
  e2e_ms_median?: number;
  witness_ms?: { median: number };
  verify_ms?: { median: number };
  proof_bytes?: number;
  error?: string;
  variant?: boolean;
  size?: { kind: string; value: number };
}
interface NativeDoc {
  schema: string;
  generated_at: string;
  machine: { id: string; model: string; chip: string; memory_gb: number };
  reps: number;
  cooldown_s?: number;
  load_avg: { start: number[]; note?: string };
  results: NativeRow[];
}
export interface BrowserDoc {
  schema: 'provebench/browser@1';
  generated_at: string;
  device: DeviceInfo;
  reps: number;
  threads: number;
  app_version: string;
  results: CellResult[];
  note?: string;
}
interface Manifest {
  files: Record<string, number>;
  reference: { native: NativeDoc[]; browser: BrowserDoc[] };
}
interface RankEntry {
  who: string;
  detail: string;
  kind: 'native' | 'browser' | 'you';
  system: SystemId;
  ms: number;
}

const APP_VERSION = '0.1.0';
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const fmt = (ms: number | null | undefined) =>
  ms == null || Number.isNaN(ms)
    ? 'n/a'
    : ms >= 1000
      ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)} s`
      : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
const fmtParts = (ms: number) =>
  ms >= 1000 ? [(ms / 1000).toFixed(ms >= 10000 ? 1 : 2), 's'] : [String(Math.round(ms)), 'ms'];
const bytes = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`;

let manifest: Manifest = { files: {}, reference: { native: [], browser: [] } };
let sizes: { noir: Record<string, { gates: number }>; circom: Record<string, { constraints: number }> } = {
  noir: {},
  circom: {},
};
let device: DeviceInfo;
let reps = 3;
let results: CellResult[] = [];
let running = false;

const available = (w: Workload, sys: SystemId) =>
  sys === 'noir-ultrahonk'
    ? !!w.noir && `noir/${w.noir}.json` in manifest.files
    : !!w.circom && `circom/${w.circom}.zkey` in manifest.files;

// ---------- layout ----------
function shell() {
  $('#app').innerHTML = `
  <div class="wrap">
    <header class="top">
      <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span>ProveBench</div>
      <nav aria-label="Sections"><a href="#run">Run</a><a href="#rank">Rank</a><a href="#native">Native</a><a href="https://github.com/agnij-dutta/provebench">Source</a></nav>
    </header>

    <div class="hero">
      <div class="eyebrow">Open ZK proving benchmark</div>
      <h1>How fast is ZK proving, <em>really?</em></h1>
      <p class="lede">Same circuits, same inputs, different proving systems. Run Noir/UltraHonk (bb.js) and Circom/Groth16 (snarkjs) right here, on the device in your hand, and see where it lands.</p>
      <div class="headline" id="headline"></div>
    </div>

    <section id="run" aria-labelledby="run-h">
      <h2 id="run-h">Run it on this device</h2>
      <p class="sub">Everything runs locally in your browser via WebAssembly. Nothing is uploaded. A full default run takes about a minute on a laptop and a few minutes on a phone. Keep the tab in the foreground.</p>
      <div class="panel panel-pad">
        <div class="device" id="device" aria-live="polite"></div>
        <div id="iso"></div>
        <div class="controls">
          <div class="wl-grid" id="workloads" role="group" aria-label="Workloads"></div>
          <div class="runbar">
            <div class="seg" role="group" aria-label="Repetitions" id="reps">
              <button type="button" data-r="1" aria-pressed="false">Quick · 1 rep</button>
              <button type="button" data-r="3" aria-pressed="true">Standard · 3 reps</button>
              <button type="button" data-r="5" aria-pressed="false">Thorough · 5 reps</button>
            </div>
            <button class="btn primary" id="go" type="button">Run benchmark</button>
            <span class="hint" id="eta"></span>
          </div>
        </div>
        <div class="progress" id="progress" aria-live="polite">
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Benchmark progress"><i></i></div>
          <div class="status"><span id="status-msg">Preparing</span><span id="status-pct">0%</span></div>
          <div class="cells" id="cells"></div>
        </div>
      </div>
    </section>

    <section id="results" aria-labelledby="res-h" hidden>
      <h2 id="res-h">Your results</h2>
      <p class="sub">Median of the timed reps after one warmup. Bars are scaled per workload. Solid segment is proving, hatched segment is witness generation.</p>
      <div class="panel panel-pad">
        <div class="legend" aria-hidden="true">
          <span><i class="sw noir"></i>Noir / UltraHonk (bb.js)</span>
          <span><i class="sw circom"></i>Circom / Groth16 (snarkjs)</span>
          <span><i class="hatch"></i>Witness generation</span>
        </div>
        <div class="chart" id="chart"></div>
      </div>
      <h3 class="sr-only">Results table</h3>
      <div class="tbl-wrap" style="margin-top:16px" id="table"></div>
    </section>

    <section id="share" aria-labelledby="share-h" hidden>
      <h2 id="share-h">Share and submit</h2>
      <p class="sub">Download the card, post it, and send the JSON so your device joins the leaderboard. There is no backend yet: submitting means exporting the JSON and opening a pull request that adds it to <code>results/browser/</code>.</p>
      <div class="share">
        <canvas id="card" width="1200" height="675" role="img" aria-label="Shareable result card"></canvas>
        <div class="acts">
          <button class="btn primary" id="dl-png" type="button">Download card (PNG)</button>
          <button class="btn" id="dl-json" type="button">Export result JSON</button>
          <button class="btn" id="copy-json" type="button">Copy JSON to clipboard</button>
          <label class="hint" for="tweet">Post text</label>
          <textarea id="tweet" readonly></textarea>
          <button class="btn" id="copy-tweet" type="button">Copy post text</button>
        </div>
      </div>
    </section>

    <section id="rank" aria-labelledby="rank-h">
      <h2 id="rank-h">Where you rank</h2>
      <p class="sub">Prove time (median) against reference runs: browser runs submitted to the repo, plus native laptop runs for context. Run the suite above to place your device on the board.</p>
      <div class="panel panel-pad">
        <div class="rank-head">
          <label class="hint">Workload <select id="rank-w"></select></label>
          <div class="seg" role="group" aria-label="Proving system" id="rank-s">
            <button type="button" data-s="noir-ultrahonk" aria-pressed="true">Noir / UltraHonk</button>
            <button type="button" data-s="circom-groth16" aria-pressed="false">Circom / Groth16</button>
          </div>
        </div>
        <div class="rank" id="rank-list"></div>
      </div>
    </section>

    <section id="native" aria-labelledby="nat-h">
      <h2 id="nat-h">Native laptop baseline</h2>
      <p class="sub" id="nat-sub"></p>
      <div class="tbl-wrap" id="native-table"></div>
    </section>

    <footer>
      <p>ProveBench measures real proving work: witness generation, proving and verification of identical statements in each system. Circuit sizes: UltraHonk gates (bb gates) for Noir, R1CS constraints (circom --O2) for Circom.</p>
      <p>Groth16 keys here come from a bare phase-2 setup over the PSE perpetual powers of tau. Fine for timing, not for production. Numbers from shared machines carry their load average; nothing on this page is a number we did not measure.</p>
      <p>Built by <a href="https://x.com/0xholmesdev">@0xholmesdev</a>. MIT licensed.</p>
    </footer>
  </div>
  <div class="tip" id="tip" role="tooltip"></div>`;
}

// ---------- headline ----------
function headline() {
  const pick = (w: string, s: SystemId) => {
    for (const b of manifest.reference.browser) {
      const r = b.results.find((x) => x.workload === w && x.system === s && !x.error);
      if (r) return { ms: r.prove_ms.median, src: `${b.device.label}` };
    }
    return null;
  };
  let noir = pick('merkle20', 'noir-ultrahonk');
  let circom = pick('merkle20', 'circom-groth16');
  let where = 'in the browser';
  let src = noir?.src ?? '';
  if (!noir || !circom) {
    const n = manifest.reference.native[0];
    const g = (s: string) => n?.results.find((r) => r.workload === 'merkle20' && r.system === s && r.prove_ms);
    const a = g('noir-ultrahonk'),
      b = g('circom-rapidsnark');
    if (a && b) {
      noir = { ms: a.prove_ms!.median, src: '' };
      circom = { ms: b.prove_ms!.median, src: '' };
      where = 'on a laptop';
      src = `${n.machine.model} (${n.machine.chip}), native bb vs native rapidsnark`;
    }
  }
  const el = $('#headline');
  if (!noir || !circom) {
    el.innerHTML = `<div><div class="q">Run the suite to produce the first numbers.</div></div>`;
    return;
  }
  const [nv, nu] = fmtParts(noir.ms),
    [cv, cu] = fmtParts(circom.ms);
  el.innerHTML = `
    <div><div class="q">Proving a <strong>Merkle membership</strong> (depth 20, Poseidon) ${where}</div><div class="src">${esc(src)} · median prove time</div></div>
    <div class="stat"><div class="k"><i class="sw noir"></i>Noir / UltraHonk</div><div class="v">${nv}<small>${nu}</small></div><div class="sub">${(sizes.noir.merkle20?.gates ?? 0).toLocaleString('en-US')} gates</div></div>
    <div class="stat"><div class="k"><i class="sw circom"></i>Circom / Groth16</div><div class="v">${cv}<small>${cu}</small></div><div class="sub">${(sizes.circom.merkle20?.constraints ?? 0).toLocaleString('en-US')} constraints</div></div>`;
}

// ---------- device + controls ----------
function renderDevice() {
  const chips: [string, string, string?][] = [
    ['Device', device.model ?? device.kind],
    ['Browser', device.browser],
    ['OS', device.os],
    ['CPU threads', device.cores ? String(device.cores) : 'hidden'],
    ['Memory hint', device.memory_gb_hint ? `${device.memory_gb_hint} GB` : 'hidden'],
  ];
  $('#device').innerHTML = chips
    .map(([k, v]) => `<div class="chip"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`)
    .join('');
  if (!device.cross_origin_isolated) {
    $('#iso').innerHTML =
      `<div class="notice">This page is not cross-origin isolated, so WebAssembly runs single-threaded. Numbers will be slower than they should be. Serve with COOP/COEP headers (see README).</div>`;
  }
}

function renderWorkloads() {
  $('#workloads').innerHTML = WORKLOADS.map((w) => {
    const noirOk = available(w, 'noir-ultrahonk');
    const circomOk = available(w, 'circom-groth16');
    const any = noirOk || circomOk;
    const zk = w.circom ? manifest.files[`circom/${w.circom}.zkey`] : 0;
    const tags = [
      noirOk ? `<span class="tag">Noir ${(sizes.noir[w.noir!]?.gates ?? 0).toLocaleString('en-US')} gates</span>` : '',
      circomOk
        ? `<span class="tag">Circom ${(sizes.circom[w.circom!]?.constraints ?? 0).toLocaleString('en-US')} cons</span>`
        : w.circom
          ? `<span class="tag">Circom key not built</span>`
          : '',
      w.heavy && circomOk ? `<span class="tag warn">downloads ${bytes(zk)}</span>` : '',
      w.variant ? `<span class="tag">variant</span>` : '',
    ].join('');
    return `<label class="wl${any ? '' : ' disabled'}">
      <input type="checkbox" value="${w.id}" ${w.defaultOn && any ? 'checked' : ''} ${any ? '' : 'disabled'} />
      <span><span class="t">${esc(w.label)}</span><div class="d">${esc(w.blurb)}</div><div class="tags">${tags}</div></span>
    </label>`;
  }).join('');
}

function selectedWorkloads() {
  return [...document.querySelectorAll<HTMLInputElement>('#workloads input:checked')].map((i) =>
    WORKLOADS.find((w) => w.id === i.value)!,
  );
}

// ---------- run ----------
async function run() {
  if (running) return;
  const ws = selectedWorkloads();
  if (!ws.length) return;
  running = true;
  results = [];
  const go = $<HTMLButtonElement>('#go');
  go.disabled = true;
  go.textContent = 'Running...';
  const plan: { w: Workload; s: SystemId }[] = [];
  for (const w of ws)
    for (const s of ['noir-ultrahonk', 'circom-groth16'] as SystemId[]) if (available(w, s)) plan.push({ w, s });

  $('#progress').classList.add('on');
  $('#cells').innerHTML = plan
    .map(
      (p, i) =>
        `<div class="cell" id="c${i}"><span class="dot" aria-hidden="true"></span><span>${esc(p.w.short)} · ${SYSTEMS[p.s].label}</span><span class="st">queued</span></div>`,
    )
    .join('');
  const bar = $('#progress .bar');
  const setP = (frac: number, msg: string) => {
    const pct = Math.round(frac * 100);
    $<HTMLElement>('#progress .bar > i').style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    $('#status-pct').textContent = `${pct}%`;
    $('#status-msg').textContent = msg;
  };

  for (let i = 0; i < plan.length; i++) {
    const { w, s } = plan[i];
    const cell = $(`#c${i}`);
    cell.className = 'cell run';
    const st = $('.st', cell);
    const progress = (msg: string, f?: number) => {
      st.textContent = msg;
      setP((i + Math.min(f ?? 0, 0.99)) / plan.length, `${w.short} · ${SYSTEMS[s].label}: ${msg}`);
    };
    try {
      const r =
        s === 'noir-ultrahonk' ? await runNoir(w.noir!, reps, progress) : await runCircom(w.circom!, reps, progress);
      r.workload = w.id;
      results.push(r);
      cell.className = 'cell done';
      st.textContent = `prove ${fmt(r.prove_ms.median)}${r.verified ? '' : ' (verify failed)'}`;
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ workload: w.id, system: s, error: msg } as CellResult);
      cell.className = 'cell err';
      st.textContent = `failed: ${msg.slice(0, 60)}`;
    }
    renderResults();
  }
  setP(1, 'Done');
  running = false;
  go.disabled = false;
  go.textContent = 'Run again';
  renderShare();
  renderRank();
  (window as unknown as { __provebench: BrowserDoc }).__provebench = resultDoc();
}

// ---------- results chart + table ----------
function renderResults() {
  const ok = results.filter((r) => !r.error);
  if (!results.length) return;
  $('#results').hidden = false;
  const byW = WORKLOADS.filter((w) => results.some((r) => r.workload === w.id));
  $('#chart').innerHTML = byW
    .map((w) => {
      const rows = (['noir-ultrahonk', 'circom-groth16'] as SystemId[]).map((s) => ({
        s,
        r: results.find((x) => x.workload === w.id && x.system === s),
      }));
      const max = Math.max(...rows.map(({ r }) => (r && !r.error ? r.e2e_ms_median : 0)), 1);
      const both = rows.every(({ r }) => r && !r.error);
      let ratio = '';
      if (both) {
        const [a, b] = rows.map(({ r }) => r!.prove_ms.median);
        ratio = a < b ? `Noir proves ${(b / a).toFixed(1)}x faster` : `Groth16 proves ${(a / b).toFixed(1)}x faster`;
      }
      return `<div class="grp">
      <div class="grp-h"><span class="n">${esc(w.label)}</span><span class="r">${ratio}</span></div>
      ${rows
        .map(({ s, r }) => {
          const lab = `<span class="lab"><i class="sw ${s === 'noir-ultrahonk' ? 'noir' : 'circom'}"></i>${SYSTEMS[s].label}</span>`;
          if (!r)
            return `<div class="row">${lab}<span class="na">${(s === 'noir-ultrahonk' ? w.noir : w.circom) ? 'not run' : 'no equivalent circuit'}</span></div>`;
          if (r.error) return `<div class="row">${lab}<span class="na">failed</span></div>`;
          const ww = (r.witness_ms.median / max) * 72,
            pw = (r.prove_ms.median / max) * 72;
          return `<div class="row">${lab}<div class="track" tabindex="0" data-w="${w.id}" data-s="${s}" aria-label="${esc(`${SYSTEMS[s].label}, ${w.label}: prove ${fmt(r.prove_ms.median)}, witness ${fmt(r.witness_ms.median)}`)}">
          <span class="seg-b w" style="width:${ww}%;background-color:${SYSTEMS[s].color}"></span><span class="seg-b p" style="width:${pw}%;background:${SYSTEMS[s].color}"></span>
          <span class="val">${fmt(r.prove_ms.median)} <small>+ ${fmt(r.witness_ms.median)}</small></span></div></div>`;
        })
        .join('')}
    </div>`;
    })
    .join('');

  $('#table').innerHTML =
    `<table><thead><tr><th>Workload</th><th>System</th><th>Witness</th><th>Prove (med)</th><th>Prove (p90)</th><th>Verify</th><th>First run</th><th>Proof</th><th>Downloaded</th></tr></thead><tbody>
    ${ok
      .map(
        (
          r,
        ) => `<tr><td class="name">${esc(WORKLOADS.find((w) => w.id === r.workload)!.short)}</td><td class="name"><span class="sys"><i class="sw ${r.system === 'noir-ultrahonk' ? 'noir' : 'circom'}"></i>${SYSTEMS[r.system].label}</span></td>
      <td>${fmt(r.witness_ms.median)}</td><td><strong>${fmt(r.prove_ms.median)}</strong></td><td>${fmt(r.prove_ms.p90)}</td><td>${fmt(r.verify_ms.median)}</td><td>${fmt(r.first_run_ms)}</td><td>${bytes(r.proof_bytes)}</td><td>${bytes(r.download_bytes)}</td></tr>`,
      )
      .join('')}
  </tbody></table>`;
  bindTips();
}

function bindTips() {
  const tip = $('#tip');
  document.querySelectorAll<HTMLElement>('.track[data-w]').forEach((el) => {
    const r = results.find((x) => x.workload === el.dataset.w && x.system === el.dataset.s);
    if (!r || r.error) return;
    const show = (x: number, y: number) => {
      tip.innerHTML = `<div class="tt"><i class="sw ${r.system === 'noir-ultrahonk' ? 'noir' : 'circom'}"></i>${SYSTEMS[r.system].label}</div><dl>
        <dt>prove median</dt><dd>${fmt(r.prove_ms.median)}</dd><dt>prove p90</dt><dd>${fmt(r.prove_ms.p90)}</dd>
        <dt>witness</dt><dd>${fmt(r.witness_ms.median)}</dd><dt>verify</dt><dd>${fmt(r.verify_ms.median)}</dd>
        <dt>first run</dt><dd>${fmt(r.first_run_ms)}</dd><dt>proof size</dt><dd>${bytes(r.proof_bytes)}</dd><dt>reps</dt><dd>${r.prove_ms.n}</dd></dl>`;
      tip.classList.add('on');
      const w = tip.offsetWidth,
        h = tip.offsetHeight;
      tip.style.left = `${Math.min(window.innerWidth - w - 8, x + 14)}px`;
      tip.style.top = `${Math.max(8, y - h - 12)}px`;
    };
    el.onmousemove = (e) => show(e.clientX, e.clientY);
    el.onmouseleave = () => tip.classList.remove('on');
    el.onfocus = () => {
      const b = el.getBoundingClientRect();
      show(b.left + 40, b.top);
    };
    el.onblur = () => tip.classList.remove('on');
  });
}

// ---------- share ----------
function resultDoc(): BrowserDoc {
  return {
    schema: 'provebench/browser@1',
    generated_at: new Date().toISOString(),
    device,
    reps,
    threads: threadsAvailable(),
    app_version: APP_VERSION,
    results,
  };
}
function postText() {
  const g = (s: SystemId) => results.find((r) => r.workload === 'merkle20' && r.system === s && !r.error);
  const a = g('noir-ultrahonk'),
    b = g('circom-groth16');
  const where =
    device.kind === 'phone' ? "my phone's browser" : device.kind === 'tablet' ? "my tablet's browser" : 'my browser';
  const lines = [];
  if (a && b)
    lines.push(
      `Proving a Merkle membership in ${where} (${device.model ?? device.os}, ${device.browser}): Noir/UltraHonk ${fmt(a.prove_ms.median)}, Circom/Groth16 ${fmt(b.prove_ms.median)}.`,
    );
  else lines.push(`I ran ProveBench in ${where} (${device.model ?? device.os}, ${device.browser}).`);
  const cap = results.filter((r) => r.workload === 'cap_check' && !r.error);
  if (cap.length)
    lines.push(
      `Agent spend-cap proof: ${cap.map((r) => `${SYSTEMS[r.system].label.split(' / ')[1]} ${fmt(r.prove_ms.median)}`).join(', ')}.`,
    );
  lines.push('How fast is yours? #ZK #ProveBench');
  return lines.join('\n');
}
function renderShare() {
  if (!results.some((r) => !r.error)) return;
  $('#share').hidden = false;
  drawCard($<HTMLCanvasElement>('#card'), device, results);
  $<HTMLTextAreaElement>('#tweet').value = postText();
}
function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = () =>
  `${(device.model ?? device.os).replace(/[^a-z0-9]+/gi, '-')}-${device.browser.replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase();
async function copy(text: string, btn: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(text);
    const t = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = t), 1400);
  } catch {
    /* ignore */
  }
}

// ---------- rank ----------
let rankSys: SystemId = 'noir-ultrahonk';
function rankEntries(w: string, s: SystemId): RankEntry[] {
  const out: RankEntry[] = [];
  for (const b of manifest.reference.browser) {
    const r = b.results.find((x) => x.workload === w && x.system === s && !x.error);
    if (r)
      out.push({
        who: b.device.label,
        detail: `browser · ${b.threads} threads`,
        kind: 'browser',
        system: s,
        ms: r.prove_ms.median,
      });
  }
  for (const n of manifest.reference.native) {
    const names = s === 'noir-ultrahonk' ? ['noir-ultrahonk'] : ['circom-rapidsnark', 'circom-snarkjs'];
    for (const r of n.results.filter((x) => x.workload === w && names.includes(x.system) && x.prove_ms)) {
      const how =
        r.system === 'noir-ultrahonk'
          ? 'native bb CLI'
          : r.system === 'circom-rapidsnark'
            ? 'native rapidsnark'
            : 'snarkjs in Node';
      out.push({
        who: `${n.machine.model} (${n.machine.chip.replace('Apple ', '')})`,
        detail: `${how} · load ${(r as NativeRow & { load_avg_1m_before?: number }).load_avg_1m_before ?? n.load_avg.start[0]}`,
        kind: 'native',
        system: s,
        ms: r.prove_ms!.median,
      });
    }
  }
  const mine = results.find((x) => x.workload === w && x.system === s && !x.error);
  if (mine)
    out.push({
      who: `You: ${device.label}`,
      detail: `browser · ${threadsAvailable()} threads`,
      kind: 'you',
      system: s,
      ms: mine.prove_ms.median,
    });
  return out.sort((a, b) => a.ms - b.ms);
}
function renderRank() {
  const sel = $<HTMLSelectElement>('#rank-w');
  if (!sel.options.length) {
    sel.innerHTML = WORKLOADS.map((w) => `<option value="${w.id}">${esc(w.label)}</option>`).join('');
    sel.onchange = renderRank;
  }
  const w = sel.value || 'merkle20';
  const list = rankEntries(w, rankSys);
  const max = Math.max(...list.map((e) => e.ms), 1);
  const el = $('#rank-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty">No reference runs for this combination yet. Run the suite and submit yours.</div>`;
    return;
  }
  el.innerHTML =
    list
      .map(
        (e, i) => `<div class="rk${e.kind === 'you' ? ' you' : ''}">
      <span class="pos">#${i + 1}</span>
      <span class="who"><div>${esc(e.who)}</div><small>${esc(e.detail)}</small></span>
      <span class="b" style="width:${Math.max(2, (e.ms / max) * 100)}%;background:${e.kind === 'native' ? 'var(--s-native)' : SYSTEMS[e.system].color}" aria-hidden="true"></span>
      <span class="t">${fmt(e.ms)}</span></div>`,
      )
      .join('') +
    `<div class="legend" style="margin:10px 0 0" aria-hidden="true"><span><i class="sw ${rankSys === 'noir-ultrahonk' ? 'noir' : 'circom'}"></i>Browser run</span><span><i class="sw native"></i>Native run (context)</span></div>`;
}

// ---------- native table ----------
function renderNative() {
  const n = manifest.reference.native[0];
  if (!n) {
    $('#native-table').innerHTML = `<div class="empty">No native results bundled.</div>`;
    return;
  }
  $('#nat-sub').textContent =
    `${n.machine.model}, ${n.machine.chip}, ${n.machine.memory_gb} GB. Measured ${n.generated_at.slice(0, 10)}, median of ${n.reps} reps${n.cooldown_s ? ` with a ${n.cooldown_s} s cooldown between cells` : ''}, load average ${n.load_avg.start.join(' / ')} at start. ${n.load_avg.note ?? 'No note on what else was running.'}`;
  const sysName: Record<string, [string, string]> = {
    'noir-ultrahonk': ['Noir / UltraHonk (bb)', 'noir'],
    'circom-rapidsnark': ['Circom / Groth16 (rapidsnark)', 'circom'],
    'circom-snarkjs': ['Circom / Groth16 (snarkjs, Node)', 'circom'],
  };
  $('#native-table').innerHTML =
    `<table><thead><tr><th>Workload</th><th>System</th><th>Size</th><th>Witness</th><th>Prove (med)</th><th>Verify</th><th>Proof</th></tr></thead><tbody>
    ${n.results
      .filter((r) => !r.error)
      .map(
        (
          r,
        ) => `<tr><td class="name">${esc(WORKLOADS.find((w) => w.id === r.workload)?.short ?? r.workload.replace(/_/g, ' '))}</td>
      <td class="name"><span class="sys"><i class="sw ${sysName[r.system][1]}"></i>${sysName[r.system][0]}</span></td>
      <td>${r.size ? `${r.size.value.toLocaleString('en-US')} ${r.size.kind === 'ultrahonk_gates' ? 'gates' : 'cons'}` : ''}</td>
      <td>${fmt(r.witness_ms?.median)}</td><td><strong>${fmt(r.prove_ms?.median)}</strong></td><td>${fmt(r.verify_ms?.median)}</td><td>${bytes(r.proof_bytes ?? 0)}</td></tr>`,
      )
      .join('')}
  </tbody></table>`;
}

// ---------- boot ----------
async function boot() {
  shell();
  const [m, s, d] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/manifest.json`)
      .then((r) => r.json())
      .catch(() => manifest),
    fetch(`${import.meta.env.BASE_URL}data/circuit-sizes.json`)
      .then((r) => r.json())
      .catch(() => sizes),
    detectDevice(),
  ]);
  manifest = m;
  sizes = s;
  device = d;
  headline();
  renderDevice();
  renderWorkloads();
  renderRank();
  renderNative();

  $('#reps').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    reps = Number(b.dataset.r);
    document.querySelectorAll('#reps button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  $('#rank-s').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    rankSys = b.dataset.s as SystemId;
    document.querySelectorAll('#rank-s button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderRank();
  });
  $('#go').addEventListener('click', run);
  $('#dl-png').addEventListener('click', () =>
    $<HTMLCanvasElement>('#card').toBlob((b) => b && download(`provebench-${slug()}.png`, b)),
  );
  $('#dl-json').addEventListener('click', () =>
    download(
      `provebench-${slug()}.json`,
      new Blob([JSON.stringify(resultDoc(), null, 2)], { type: 'application/json' }),
    ),
  );
  $('#copy-json').addEventListener('click', (e) =>
    copy(JSON.stringify(resultDoc(), null, 2), e.currentTarget as HTMLButtonElement),
  );
  $('#copy-tweet').addEventListener('click', (e) =>
    copy($<HTMLTextAreaElement>('#tweet').value, e.currentTarget as HTMLButtonElement),
  );

  // automation hook: ?autorun=1&reps=N runs the default suite on load; every
  // finished run is exposed as window.__provebench
  const q = new URLSearchParams(location.search);
  if (q.get('reps')) {
    reps = Number(q.get('reps'));
    document
      .querySelectorAll('#reps button')
      .forEach((x) => x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.r === q.get('reps'))));
  }
  if (q.get('autorun') === '1') await run();
}
boot();
