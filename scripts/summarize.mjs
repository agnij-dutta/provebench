// Builds results/SUMMARY.md: native and browser median prove times side by side.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'results');
const native = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const bdir = join(dir, 'browser');
const browser = existsSync(bdir)
  ? readdirSync(bdir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(bdir, f), 'utf8')))
  : [];

const fmt = (x) =>
  x == null ? 'n/a' : x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${x < 10 ? x.toFixed(1) : Math.round(x)} ms`;
const W = [
  'poseidon_chain',
  'merkle20',
  'sha256_1k',
  'ecdsa_secp256k1',
  'cap_check',
  'poseidon2_chain',
  'merkle20_poseidon2',
];
const lines = [
  '# ProveBench summary',
  '',
  'Median prove time. Witness generation and verification are in the per-machine files.',
  '',
];

for (const n of native) {
  const b = browser.find((x) => x.device.label.includes(n.machine.chip.replace('Apple ', '')));
  const cols = ['Native bb (UltraHonk)', 'Native rapidsnark (Groth16)', 'snarkjs in Node (Groth16)'];
  if (b) cols.push(`${b.device.browser}: bb.js (UltraHonk)`, `${b.device.browser}: snarkjs (Groth16)`);
  lines.push(`## ${n.machine.model} (${n.machine.chip}, ${n.machine.memory_gb} GB)`, '');
  lines.push(
    `Native load average at start: ${n.load_avg.start.join(' / ')}.${b ? ` Browser run: ${b.note ?? ''}` : ''}`,
    '',
  );
  lines.push(`| Workload | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---:').join('|')}|`);
  for (const w of W) {
    const g = (s) => n.results.find((r) => r.workload === w && r.system === s && !r.error)?.prove_ms?.median;
    const gb = (s) => b?.results.find((r) => r.workload === w && r.system === s && !r.error)?.prove_ms?.median;
    const row = [g('noir-ultrahonk'), g('circom-rapidsnark'), g('circom-snarkjs')];
    if (b) row.push(gb('noir-ultrahonk'), gb('circom-groth16'));
    if (row.every((x) => x == null)) continue;
    lines.push(`| ${w} | ${row.map(fmt).join(' | ')} |`);
  }
  lines.push('');
}
lines.push(
  '`poseidon2_chain` and `merkle20_poseidon2` are Noir-only variants using Poseidon2, not like-for-like with Circom.',
  '',
);
writeFileSync(join(dir, 'SUMMARY.md'), lines.join('\n'));
console.log(lines.join('\n'));
