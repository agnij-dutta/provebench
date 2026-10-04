// Browser prover harness. Runs Noir (noir_js + bb.js UltraHonk) and Circom
// (snarkjs Groth16) on the exact circuits and inputs the native suite uses.
import { Noir } from '@noir-lang/noir_js';
import initACVM from '@noir-lang/acvm_js';
import initNoirC from '@noir-lang/noirc_abi';
import acvmWasm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noircWasm from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
// @ts-expect-error snarkjs ships no types
import * as snarkjs from 'snarkjs';
import type { SystemId } from './workloads';

export interface Stats {
  median: number;
  p90: number;
  min: number;
  max: number;
  n: number;
  samples: number[];
}
export interface CellResult {
  workload: string;
  system: SystemId;
  witness_ms: Stats;
  prove_ms: Stats;
  verify_ms: Stats;
  e2e_ms_median: number;
  first_run_ms: number;
  proof_bytes: number;
  download_bytes: number;
  verified: boolean;
  error?: string;
}
export type Progress = (msg: string, frac?: number) => void;

const BASE = `${import.meta.env.BASE_URL}data`;

export function stats(xs: number[]): Stats {
  const s = [...xs].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 100) / 100;
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const p90 = s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)];
  return { median: r(med), p90: r(p90), min: r(s[0]), max: r(s[s.length - 1]), n: s.length, samples: xs.map(r) };
}

const yieldUI = () => new Promise((r) => setTimeout(r, 30));

async function fetchBytes(path: string, onProgress?: (got: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`fetch ${path}: ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
const fetchJSON = async (path: string) => {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`fetch ${path}: ${res.status}`);
  return res.json();
};

let noirReady: Promise<unknown> | null = null;
let bbApi: Promise<Barretenberg> | null = null;
export function threadsAvailable() {
  return globalThis.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 4, 16) : 1;
}
function getBb() {
  bbApi ??= Barretenberg.new({ threads: threadsAvailable() });
  return bbApi;
}

export async function runNoir(circuitName: string, reps: number, progress: Progress): Promise<CellResult> {
  noirReady ??= Promise.all([initACVM(fetch(acvmWasm)), initNoirC(fetch(noircWasm))]);
  await noirReady;
  progress('downloading circuit');
  const circuitBytes = await fetchBytes(`noir/${circuitName}.json`);
  const circuit = JSON.parse(new TextDecoder().decode(circuitBytes));
  const input = await fetchJSON(`inputs/${circuitName}.json`);
  progress('starting Barretenberg (WASM)');
  const api = await getBb();
  const noir = new Noir(circuit);
  const backend = new UltraHonkBackend(circuit.bytecode, api);

  // first run: includes CRS download (cached in IndexedDB) and key construction
  progress('warmup: first proof (fetches CRS on first use)');
  await yieldUI();
  const t0 = performance.now();
  const { witness: w0 } = await noir.execute(input);
  let proof = await backend.generateProof(w0);
  const first = performance.now() - t0;

  const witness: number[] = [],
    prove: number[] = [],
    verify: number[] = [];
  let ok = true;
  for (let i = 0; i < reps; i++) {
    progress(`rep ${i + 1}/${reps}: witness`, i / reps);
    await yieldUI();
    let t = performance.now();
    const { witness: w } = await noir.execute(input);
    witness.push(performance.now() - t);
    progress(`rep ${i + 1}/${reps}: proving`, (i + 0.3) / reps);
    await yieldUI();
    t = performance.now();
    proof = await backend.generateProof(w);
    prove.push(performance.now() - t);
    progress(`rep ${i + 1}/${reps}: verifying`, (i + 0.9) / reps);
    t = performance.now();
    ok = (await backend.verifyProof(proof)) && ok;
    verify.push(performance.now() - t);
  }
  const ws = stats(witness),
    ps = stats(prove);
  return {
    workload: circuitName,
    system: 'noir-ultrahonk',
    witness_ms: ws,
    prove_ms: ps,
    verify_ms: stats(verify),
    e2e_ms_median: Math.round((ws.median + ps.median) * 100) / 100,
    first_run_ms: Math.round(first),
    proof_bytes: proof.proof.length,
    download_bytes: circuitBytes.length,
    verified: ok,
  };
}

export async function runCircom(name: string, reps: number, progress: Progress): Promise<CellResult> {
  progress('downloading circuit wasm');
  const wasm = await fetchBytes(`circom/${name}.wasm`);
  const zkey = await fetchBytes(`circom/${name}.zkey`, (got, total) =>
    progress(
      `downloading proving key ${(got / 1e6).toFixed(1)}${total ? ` / ${(total / 1e6).toFixed(1)}` : ''} MB`,
      total ? got / total : undefined,
    ),
  );
  const vkey = await fetchJSON(`circom/${name}.vkey.json`);
  const input = await fetchJSON(`inputs/${name}.json`);
  const mem = (data: Uint8Array) => ({ type: 'mem', data });

  const once = async () => {
    const wtns: { type: string; data?: Uint8Array } = { type: 'mem' };
    let t = performance.now();
    await snarkjs.wtns.calculate(input, mem(wasm), wtns);
    const w = performance.now() - t;
    t = performance.now();
    const { proof, publicSignals } = await snarkjs.groth16.prove(mem(zkey), wtns);
    const p = performance.now() - t;
    return { w, p, proof, publicSignals };
  };

  progress('warmup: first proof');
  await yieldUI();
  const t0 = performance.now();
  let last = await once();
  const first = performance.now() - t0;

  const witness: number[] = [],
    prove: number[] = [],
    verify: number[] = [];
  let ok = true;
  for (let i = 0; i < reps; i++) {
    progress(`rep ${i + 1}/${reps}: witness + proving`, i / reps);
    await yieldUI();
    last = await once();
    witness.push(last.w);
    prove.push(last.p);
    progress(`rep ${i + 1}/${reps}: verifying`, (i + 0.9) / reps);
    const t = performance.now();
    ok = (await snarkjs.groth16.verify(vkey, last.publicSignals, last.proof)) && ok;
    verify.push(performance.now() - t);
  }
  const ws = stats(witness),
    ps = stats(prove);
  return {
    workload: name,
    system: 'circom-groth16',
    witness_ms: ws,
    prove_ms: ps,
    verify_ms: stats(verify),
    e2e_ms_median: Math.round((ws.median + ps.median) * 100) / 100,
    first_run_ms: Math.round(first),
    proof_bytes: 256,
    download_bytes: wasm.length + zkey.length,
    verified: ok,
  };
}
