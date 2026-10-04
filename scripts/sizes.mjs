// Records circuit sizes per system into artifacts/circuit-sizes.json.
//  Noir:   `bb gates` circuit_size (UltraHonk rows, before power-of-two padding)
//          and ACIR opcode count.
//  Circom: R1CS constraints and wires after `--O2` simplification.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = { noir: {}, circom: {} };

for (const f of readdirSync(join(root, 'artifacts/noir')).filter((f) => f.endsWith('.json'))) {
  const name = f.replace('.json', '');
  const txt = execFileSync('bb', ['gates', '-b', join(root, 'artifacts/noir', f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const j = JSON.parse(txt.slice(txt.indexOf('{')));
  const fn = j.functions[0];
  out.noir[name] = { gates: fn.circuit_size, acir_opcodes: fn.acir_opcodes };
}

for (const f of readdirSync(join(root, 'circuits/circom')).filter((f) => f.endsWith('.circom'))) {
  const name = f.replace('.circom', '');
  const tmp = mkdtempSync(join(tmpdir(), 'pb-'));
  try {
    const txt = execFileSync('circom', [join(root, 'circuits/circom', f), '--O2', '--r1cs', '-o', tmp], { encoding: 'utf8' })
      .replace(/\x1b\[[0-9;]*m/g, '');
    const num = (re) => Number(txt.match(re)?.[1]);
    out.circom[name] = {
      constraints: num(/non-linear constraints: (\d+)/) + num(/(?<!non-)linear constraints: (\d+)/),
      wires: num(/wires: (\d+)/),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

writeFileSync(join(root, 'artifacts/circuit-sizes.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
