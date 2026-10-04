// snarkjs Groth16 prove/verify timing in Node (pure JS + WASM, multithreaded
// via worker threads). One warmup, then <reps> timed runs.
// usage: node snarkjs-worker.mjs <workload> <wtnsFile> <reps> <outDir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as snarkjs from 'snarkjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [workload, wtns, repsArg, outDir] = process.argv.slice(2);
const reps = Number(repsArg);
const zkey = join(root, 'artifacts/circom', `${workload}.zkey`);
const vkey = JSON.parse(readFileSync(join(root, 'artifacts/circom', `${workload}.vkey.json`), 'utf8'));

let { proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtns); // warmup
const prove = [];
for (let i = 0; i < reps; i++) {
  const t0 = performance.now();
  ({ proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtns));
  prove.push(performance.now() - t0);
}
const verify = [];
let ok = await snarkjs.groth16.verify(vkey, publicSignals, proof); // warmup
for (let i = 0; i < reps; i++) {
  const t0 = performance.now();
  ok = (await snarkjs.groth16.verify(vkey, publicSignals, proof)) && ok;
  verify.push(performance.now() - t0);
}
writeFileSync(join(outDir, 'proof.json'), JSON.stringify(proof));
writeFileSync(join(outDir, 'public.json'), JSON.stringify(publicSignals));
console.log(JSON.stringify({ prove_ms: prove, verify_ms: verify, ok, max_rss_kb: process.resourceUsage().maxRSS }));
// snarkjs keeps curve worker threads alive
process.exit(0);
