#!/usr/bin/env node
// ProveBench native runner.
//
//   node bench/run.mjs [--reps 5] [--workloads a,b] [--systems x,y] [--machine id]
//                      [--merge] [--note "conditions"] [--cooldown seconds]
//
// Runs every workload x system, N timed repetitions each (after one warmup),
// and writes results/<machine>.json and results/<machine>.md.
//
// Systems
//   noir-ultrahonk     Noir (nargo 1.0.0-beta.19) witness via noir_js, proof via native `bb` CLI (UltraHonk)
//   circom-rapidsnark  Circom witness via snarkjs (WASM), Groth16 proof via native rapidsnark
//   circom-snarkjs     Circom witness via snarkjs (WASM), Groth16 proof via snarkjs in Node
//
// Timing notes
//   * bb and rapidsnark are timed as CLI invocations (wall clock incl. process
//     start and key/CRS load). snarkjs and witness generation are timed
//     in-process after a warmup.
//   * Peak memory: max RSS of the measured process (`/usr/bin/time -l` for CLIs,
//     getrusage for Node workers; the Node figure covers the whole worker).
import { spawnSync, execSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (!a.startsWith('--')) return acc;
    const next = arr[i + 1];
    return [...acc, [a.slice(2), next === undefined || next.startsWith('--') ? true : next]];
  }, []),
);
const REPS = Number(args.reps ?? 5);

const WORKLOADS = [
  { id: 'poseidon_chain', label: 'Poseidon hash chain (N=100)', noir: 'poseidon_chain', circom: 'poseidon_chain' },
  { id: 'merkle20', label: 'Merkle membership, depth 20 (Poseidon)', noir: 'merkle20', circom: 'merkle20' },
  { id: 'sha256_1k', label: 'SHA-256 of 1 KiB', noir: 'sha256_1k', circom: 'sha256_1k' },
  { id: 'ecdsa_secp256k1', label: 'ECDSA secp256k1 verify', noir: 'ecdsa_secp256k1', circom: null },
  { id: 'cap_check', label: 'Spend cap check (16 payments, u64)', noir: 'cap_check', circom: 'cap_check' },
  { id: 'poseidon2_chain', label: 'Variant: Poseidon2 chain (N=100), Noir-native hash', noir: 'poseidon2_chain', circom: null, variant: true },
  { id: 'merkle20_poseidon2', label: 'Variant: Merkle depth 20 (Poseidon2), Noir-native hash', noir: 'merkle20_poseidon2', circom: null, variant: true },
];
const SYSTEMS = ['noir-ultrahonk', 'circom-rapidsnark', 'circom-snarkjs'];

const wantW = args.workloads?.split(',');
const wantS = args.systems?.split(',');
const workloads = WORKLOADS.filter((w) => !wantW || wantW.includes(w.id));
const systems = SYSTEMS.filter((s) => !wantS || wantS.includes(s));

const toolsDir = join(root, 'build/tools');
const rsDir = existsSync(toolsDir) ? readdirSync(toolsDir).find((d) => d.startsWith('rapidsnark-')) : null;
const RAPIDSNARK = rsDir ? join(toolsDir, rsDir, 'bin') : join(toolsDir, 'rapidsnark-missing');
const sizes = JSON.parse(readFileSync(join(root, 'artifacts/circuit-sizes.json'), 'utf8'));
const tmp = join(root, 'build/run');
mkdirSync(tmp, { recursive: true });

// ---------- helpers ----------
const sh = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const r = (x) => Math.round(x * 100) / 100;
  return { median: r(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2), p90: r(q(0.9)), min: r(s[0]), max: r(s[s.length - 1]), n: s.length, samples: xs.map(r) };
};
// Run a CLI under /usr/bin/time -l; returns wall ms and max RSS (MB).
function timed(cmd, argv) {
  const t0 = performance.now();
  const p = spawnSync('/usr/bin/time', ['-l', cmd, ...argv], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const ms = performance.now() - t0;
  if (p.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} failed:\n${p.stderr}\n${p.stdout}`);
  const rss = Number(p.stderr.match(/(\d+)\s+maximum resident set size/)?.[1] ?? 0) / 1048576;
  return { ms, rss_mb: rss, out: p.stdout + p.stderr };
}
function node(script, argv) {
  const p = spawnSync(process.execPath, ['--max-old-space-size=8192', join(root, 'bench', script), ...argv], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (p.status !== 0) throw new Error(`${script} failed:\n${p.stderr}`);
  return JSON.parse(p.stdout.trim().split('\n').pop());
}
const load = () => os.loadavg().map((x) => Math.round(x * 100) / 100);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// os.loadavg() counts the benchmark's own threads (bb and rapidsnark use every
// core), so it cannot tell you what else was running. Instead, sample how busy
// the host is over one second while the benchmark itself is idle.
function hostBusyPct() {
  const snap = () => os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
  const a = snap();
  sleep(1000);
  const b = snap();
  return Math.round((1 - (b.idle - a.idle) / (b.total - a.total)) * 1000) / 10;
}
const COOLDOWN_S = Number(args.cooldown ?? 0);
const log = (...a) => console.error('[provebench]', ...a);

// ---------- machine ----------
function machine() {
  const hw = sh('system_profiler SPHardwareDataType') ?? '';
  const field = (k) => hw.match(new RegExp(`${k}: (.+)`))?.[1]?.trim();
  const model = field('Model Name') ?? os.hostname();
  const chip = field('Chip') ?? os.cpus()[0]?.model;
  const memGb = Math.round(os.totalmem() / 2 ** 30);
  const id = args.machine ?? `${model}-${chip}-${memGb}gb`.toLowerCase().replace(/apple /g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    model,
    model_identifier: field('Model Identifier'),
    chip,
    cores_logical: os.cpus().length,
    cores_performance: Number(sh('sysctl -n hw.perflevel0.physicalcpu')) || null,
    cores_efficiency: Number(sh('sysctl -n hw.perflevel1.physicalcpu')) || null,
    memory_gb: memGb,
    os: `${os.type()} ${sh('sw_vers -productVersion') ?? os.release()}`,
    arch: os.arch(),
    node: process.version,
    power: sh('pmset -g batt')?.match(/'(.+?)'/)?.[1] ?? null,
  };
}
function toolchain() {
  const pkg = (n) => JSON.parse(readFileSync(join(root, 'node_modules', n, 'package.json'), 'utf8')).version;
  return {
    nargo: sh('nargo --version')?.match(/nargo version = (\S+)/)?.[1],
    bb: sh('bb --version'),
    circom: sh('circom --version')?.replace('circom compiler ', ''),
    snarkjs: pkg('snarkjs'),
    noir_js: pkg('@noir-lang/noir_js'),
    rapidsnark: rsDir ? `${rsDir.replace('rapidsnark-', '')} (iden3 prebuilt)` : null,
  };
}

// ---------- per-system runners ----------
function runNoir(w) {
  const dir = join(tmp, `noir-${w.noir}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const acir = join(root, 'artifacts/noir', `${w.noir}.json`);
  const wit = join(dir, 'witness.gz');
  const wres = node('witness-worker.mjs', ['noir', w.noir, String(REPS), wit]);
  timed('bb', ['write_vk', '-b', acir, '-o', dir]);
  const proveArgs = ['prove', '-b', acir, '-w', wit, '-k', join(dir, 'vk'), '-o', dir];
  timed('bb', proveArgs); // warmup (CRS cache, page cache)
  const prove = [], proveRss = [];
  for (let i = 0; i < REPS; i++) { const r = timed('bb', proveArgs); prove.push(r.ms); proveRss.push(r.rss_mb); }
  const verifyArgs = ['verify', '-p', join(dir, 'proof'), '-k', join(dir, 'vk'), '-i', join(dir, 'public_inputs')];
  timed('bb', verifyArgs);
  const verify = [], verifyRss = [];
  for (let i = 0; i < REPS; i++) { const r = timed('bb', verifyArgs); verify.push(r.ms); verifyRss.push(r.rss_mb); }
  return {
    size: { kind: 'ultrahonk_gates', value: sizes.noir[w.noir].gates, acir_opcodes: sizes.noir[w.noir].acir_opcodes },
    witness_ms: stats(wres.times_ms),
    prove_ms: stats(prove),
    verify_ms: stats(verify),
    proof_bytes: statSync(join(dir, 'proof')).size,
    peak_rss_mb: { witness: Math.round(wres.max_rss_kb / 1024), prove: Math.round(Math.max(...proveRss)), verify: Math.round(Math.max(...verifyRss)) },
    verified: true,
    notes: 'bb CLI wall time incl. process start + CRS load; default verifier target (ZK, Poseidon2 transcript).',
  };
}

function circomWitness(w, dir) {
  const wtns = join(dir, 'witness.wtns');
  return { wtns, res: node('witness-worker.mjs', ['circom', w.circom, String(REPS), wtns]) };
}

function runRapidsnark(w) {
  const dir = join(tmp, `rapidsnark-${w.circom}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { wtns, res } = circomWitness(w, dir);
  const zkey = join(root, 'artifacts/circom', `${w.circom}.zkey`);
  const proof = join(dir, 'proof.json'), pub = join(dir, 'public.json');
  const pargs = [zkey, wtns, proof, pub];
  timed(join(RAPIDSNARK, 'prover'), pargs); // warmup
  const prove = [], proveRss = [];
  for (let i = 0; i < REPS; i++) { const r = timed(join(RAPIDSNARK, 'prover'), pargs); prove.push(r.ms); proveRss.push(r.rss_mb); }
  const vargs = [join(root, 'artifacts/circom', `${w.circom}.vkey.json`), pub, proof];
  const verify = [], verifyRss = [];
  let ok = true;
  timed(join(RAPIDSNARK, 'verifier'), vargs);
  for (let i = 0; i < REPS; i++) {
    const r = timed(join(RAPIDSNARK, 'verifier'), vargs);
    ok = ok && /valid/i.test(r.out) && !/invalid/i.test(r.out);
    verify.push(r.ms); verifyRss.push(r.rss_mb);
  }
  return {
    size: { kind: 'r1cs_constraints', value: sizes.circom[w.circom].constraints, wires: sizes.circom[w.circom].wires },
    witness_ms: stats(res.times_ms),
    prove_ms: stats(prove),
    verify_ms: stats(verify),
    proof_bytes: 256,
    proof_json_bytes: statSync(proof).size,
    peak_rss_mb: { witness: Math.round(res.max_rss_kb / 1024), prove: Math.round(Math.max(...proveRss)), verify: Math.round(Math.max(...verifyRss)) },
    verified: ok,
    notes: 'rapidsnark CLI wall time incl. process start + zkey load. Proof size = 256 B (A, B, C as uncompressed BN254 points).',
  };
}

function runSnarkjs(w) {
  const dir = join(tmp, `snarkjs-${w.circom}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { wtns, res } = circomWitness(w, dir);
  const r = node('snarkjs-worker.mjs', [w.circom, wtns, String(REPS), dir]);
  return {
    size: { kind: 'r1cs_constraints', value: sizes.circom[w.circom].constraints, wires: sizes.circom[w.circom].wires },
    witness_ms: stats(res.times_ms),
    prove_ms: stats(r.prove_ms),
    verify_ms: stats(r.verify_ms),
    proof_bytes: 256,
    proof_json_bytes: statSync(join(dir, 'proof.json')).size,
    peak_rss_mb: { witness: Math.round(res.max_rss_kb / 1024), prove: Math.round(r.max_rss_kb / 1024), verify: null },
    verified: r.ok,
    notes: 'snarkjs in-process after warmup (zkey re-read from disk each prove). Peak RSS covers the whole worker (prove + verify).',
  };
}

// ---------- main ----------
const m = machine();
const startedAt = new Date().toISOString();
const loadStart = load();
log(`machine ${m.id}, reps ${REPS}, load ${loadStart.join(' ')}`);
const results = [];
for (const w of workloads) {
  for (const s of systems) {
    if (s !== 'noir-ultrahonk' && !w.circom) continue;
    if (s !== 'noir-ultrahonk' && !existsSync(join(root, 'artifacts/circom', `${w.circom}.zkey`))) {
      log(`skip ${w.id} / ${s}: zkey missing (run scripts/build-circom.sh ${w.circom})`);
      continue;
    }
    if (s === 'circom-rapidsnark' && !existsSync(RAPIDSNARK)) { log(`skip ${s}: run scripts/get-rapidsnark.sh`); continue; }
    if (COOLDOWN_S > 0 && results.length) sleep(COOLDOWN_S * 1000);
    const l0 = load();
    const busy = hostBusyPct();
    log(`${w.id} / ${s} ... (host busy ${busy}% before cell)`);
    const t0 = performance.now();
    try {
      const r = s === 'noir-ultrahonk' ? runNoir(w) : s === 'circom-rapidsnark' ? runRapidsnark(w) : runSnarkjs(w);
      r.e2e_ms_median = Math.round((r.witness_ms.median + r.prove_ms.median) * 100) / 100;
      results.push({ workload: w.id, workload_label: w.label, variant: !!w.variant, system: s, load_avg_1m_before: l0[0], host_busy_pct_before: busy, ...r });
      log(`  witness ${r.witness_ms.median} ms, prove ${r.prove_ms.median} ms (p90 ${r.prove_ms.p90}), verify ${r.verify_ms.median} ms, proof ${r.proof_bytes} B  [${Math.round(performance.now() - t0)} ms]`);
    } catch (e) {
      log(`  FAILED: ${e.message.split('\n')[0]}`);
      results.push({ workload: w.id, workload_label: w.label, system: s, error: e.message.slice(0, 2000) });
    }
  }
}
// --merge: keep cells from an existing results file that were not re-run
const outPath = join(root, 'results', `${m.id}.json`);
let merged = results;
if (args.merge && existsSync(outPath)) {
  const prev = JSON.parse(readFileSync(outPath, 'utf8'));
  const key = (r) => `${r.workload}|${r.system}`;
  const fresh = new Map(results.map((r) => [key(r), { ...r, rerun_at: startedAt }]));
  merged = prev.results.map((r) => fresh.get(key(r)) ?? r);
  for (const [k, r] of fresh) if (!prev.results.some((p) => key(p) === k)) merged.push(r);
  loadStart.splice(0, 3, ...prev.load_avg.start);
}
const doc = {
  schema: 'provebench/native@1',
  generated_at: args.merge && existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')).generated_at : startedAt,
  finished_at: new Date().toISOString(),
  machine: m,
  toolchain: toolchain(),
  reps: REPS,
  cooldown_s: COOLDOWN_S,
  // The note must describe what else was running; it is printed with every table.
  load_avg: { start: loadStart, end: load(), note: typeof args.note === 'string' ? args.note : 'os.loadavg() 1/5/15 min. No note on host conditions was given for this run.' },
  methodology: {
    timing: 'median and p90 over N reps after 1 warmup',
    witness: 'Noir: noir_js execute (WASM ACVM) in Node. Circom: snarkjs wtns.calculate (circom WASM) in Node.',
    noir_prove: 'native bb CLI, UltraHonk, default target',
    circom_prove: 'Groth16 via rapidsnark (native C++/asm) and via snarkjs (Node)',
    e2e: 'witness median + prove median',
    setup: 'Groth16 zkeys from PSE perpetual powers of tau (ppot_0080) + bare phase 2 (no contribution): benchmark only, not a secure setup',
  },
  results: merged,
};
mkdirSync(join(root, 'results'), { recursive: true });
writeFileSync(join(root, 'results', `${m.id}.json`), JSON.stringify(doc, null, 2) + '\n');
writeFileSync(join(root, 'results', `${m.id}.md`), toMarkdown(doc));
log(`wrote results/${m.id}.json and results/${m.id}.md`);

function toMarkdown(d) {
  const fmt = (x) => (x == null ? 'n/a' : x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${x.toFixed(x < 10 ? 2 : 0)} ms`);
  const sz = (r) => (r.size.kind === 'ultrahonk_gates' ? `${r.size.value.toLocaleString('en-US')} gates` : `${r.size.value.toLocaleString('en-US')} constraints`);
  const lines = [
    `# ProveBench native results: ${d.machine.model} (${d.machine.chip}, ${d.machine.memory_gb} GB)`,
    '',
    `- Run: ${d.generated_at} to ${d.finished_at}, ${d.reps} reps per cell after 1 warmup${d.cooldown_s ? `, ${d.cooldown_s} s cooldown between cells` : ''}`,
    `- CPU: ${d.machine.cores_logical} cores (${d.machine.cores_performance}P + ${d.machine.cores_efficiency}E), ${d.machine.os}, Node ${d.machine.node}${d.machine.power ? `, ${d.machine.power}` : ''}`,
    `- Toolchain: nargo ${d.toolchain.nargo}, bb ${d.toolchain.bb}, circom ${d.toolchain.circom}, snarkjs ${d.toolchain.snarkjs}, rapidsnark ${d.toolchain.rapidsnark ?? 'n/a'}`,
    `- Load average at start: ${d.load_avg.start.join(' / ')}, at end: ${d.load_avg.end.join(' / ')} (1/5/15 min)`,
    `- Host conditions: ${d.load_avg.note}`,
    '',
    '| Workload | System | Size | Witness (med) | Prove (med) | Prove (p90) | Verify (med) | Proof | Peak RSS (prove) | Host busy before | Load 1m |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const r of d.results) {
    if (r.error) { lines.push(`| ${r.workload} | ${r.system} | | | FAILED | | | | | | |`); continue; }
    lines.push(`| ${r.workload} | ${r.system} | ${sz(r)} | ${fmt(r.witness_ms.median)} | **${fmt(r.prove_ms.median)}** | ${fmt(r.prove_ms.p90)} | ${fmt(r.verify_ms.median)} | ${r.proof_bytes.toLocaleString('en-US')} B | ${r.peak_rss_mb.prove} MB | ${r.host_busy_pct_before == null ? 'n/a' : `${r.host_busy_pct_before}%`} | ${r.load_avg_1m_before} |`);
  }
  lines.push('', 'Notes:', '');
  for (const r of d.results.filter((r) => r.rerun_at)) lines.push(`- \`${r.workload} / ${r.system}\` was re-run separately at ${r.rerun_at} (load 1m before: ${r.load_avg_1m_before}).`);
  lines.push('- Host busy before: CPU utilisation of the whole machine over 1 s, sampled while the benchmark was idle just before the cell. It measures other processes; load 1m does not, because it also counts the benchmark\'s own threads.');
  lines.push('- `noir-ultrahonk`: proof timed as a native `bb prove` CLI call (includes process start and CRS load). Witness via noir_js in Node.');
  lines.push('- `circom-rapidsnark`: Groth16 via the native rapidsnark CLI (includes zkey load). Witness via snarkjs (circom WASM) in Node.');
  lines.push('- `circom-snarkjs`: Groth16 via snarkjs in Node, in-process after warmup.');
  lines.push('- Rows marked `Variant` use Poseidon2 (Noir-native) instead of circomlib Poseidon, so they are not like-for-like with Circom.');
  lines.push('- ECDSA secp256k1 has no Circom row: circom-ecdsa is ~1.5M constraints and needs a 2^21 ptau and a GB-scale zkey (see TODO).');
  lines.push('- Groth16 setup is a bare phase 2 (no contribution). Fine for timing, not a secure setup.');
  return lines.join('\n') + '\n';
}
