// In-process witness generation timing for both stacks.
// usage: node witness-worker.mjs <noir|circom> <workload> <reps> <outFile>
// Prints one JSON line: { times_ms: [...], max_rss_kb }
// Noir: noir_js (ACVM compiled to WASM) executes the ACIR, writes the
//       compressed witness bb expects.
// Circom: snarkjs wtns.calculate runs the circom-generated WASM witness
//         calculator, writes a .wtns file.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [stack, workload, repsArg, outFile] = process.argv.slice(2);
const reps = Number(repsArg);
const input = JSON.parse(readFileSync(join(root, 'inputs', `${workload}.json`), 'utf8'));
const times = [];

if (stack === 'noir') {
  const { Noir } = await import('@noir-lang/noir_js');
  const circuit = JSON.parse(readFileSync(join(root, 'artifacts/noir', `${workload}.json`), 'utf8'));
  const noir = new Noir(circuit);
  await noir.execute(input); // warmup (wasm init)
  let witness;
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    ({ witness } = await noir.execute(input));
    times.push(performance.now() - t0);
  }
  writeFileSync(outFile, witness);
} else if (stack === 'circom') {
  const snarkjs = await import('snarkjs');
  const wasm = join(root, 'artifacts/circom', `${workload}.wasm`);
  await snarkjs.wtns.calculate(input, wasm, { type: 'mem' }); // warmup
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    await snarkjs.wtns.calculate(input, wasm, outFile);
    times.push(performance.now() - t0);
  }
} else {
  throw new Error(`unknown stack ${stack}`);
}

console.log(JSON.stringify({ times_ms: times, max_rss_kb: process.resourceUsage().maxRSS }));
process.exit(0);
