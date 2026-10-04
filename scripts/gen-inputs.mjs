// Generates deterministic, identical inputs for every workload.
// Output: inputs/<workload>.json (shared by Noir, Circom, native and browser)
// and circuits/noir/<workload>/Prover.toml.
import { buildPoseidon } from 'circomlibjs';
import { createHash } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (a, b) => F.toObject(poseidon([a, b]));

// tiny deterministic PRNG (mulberry32) so inputs are reproducible
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20261004);
const randField = () => {
  let x = 0n;
  for (let i = 0; i < 7; i++) x = (x << 32n) | BigInt(Math.floor(r() * 2 ** 32));
  return x % 21888242871839275222246405745257275088548364400416873803697233186068522895617n;
};

const inputs = {};

// 1. Poseidon chain, N = 100
{
  const seed = 42n;
  let h = seed;
  for (let i = 0; i < 100; i++) h = H(h, BigInt(i));
  inputs.poseidon_chain = { seed: seed.toString(), expected: h.toString() };
}

// 2. Merkle membership, depth 20
{
  const leaf = randField();
  const index = 0b10110011100011110000; // 735472
  const siblings = Array.from({ length: 20 }, randField);
  let cur = leaf;
  for (let i = 0; i < 20; i++) {
    const bit = (index >> i) & 1;
    cur = bit ? H(siblings[i], cur) : H(cur, siblings[i]);
  }
  inputs.merkle20 = {
    root: cur.toString(),
    leaf: leaf.toString(),
    index: index.toString(),
    siblings: siblings.map(String),
  };
}

// 3. SHA-256 of 1 KiB
{
  const msg = Buffer.alloc(1024);
  for (let i = 0; i < 1024; i++) msg[i] = Math.floor(r() * 256);
  const digest = createHash('sha256').update(msg).digest();
  inputs.sha256_1k = { msg: [...msg].map(String), digest: [...digest].map(String) };
}

// 4. ECDSA secp256k1 verify
{
  const priv = createHash('sha256').update('provebench-ecdsa-key').digest();
  const pub = secp256k1.getPublicKey(priv, false); // 0x04 || x || y
  const msgHash = createHash('sha256').update('provebench: pay 25 USDC to agent-7').digest();
  const sig = secp256k1.sign(msgHash, priv, { prehash: false, lowS: true }); // compact r||s
  const sigBytes = sig instanceof Uint8Array ? sig : sig.toBytes('compact');
  if (!secp256k1.verify(sigBytes, msgHash, pub, { prehash: false })) throw new Error('bad sig');
  inputs.ecdsa_secp256k1 = {
    pub_key_x: [...pub.slice(1, 33)].map(String),
    pub_key_y: [...pub.slice(33, 65)].map(String),
    signature: [...sigBytes].map(String),
    message_hash: [...msgHash].map(String),
  };
}

// 5. Cap check (agent spending mandate): 16 payments, per-tx cap, budget
{
  const per_tx_cap = 500_000_000n; // 500 USDC in 6-decimals
  const amounts = Array.from({ length: 16 }, () => BigInt(Math.floor(r() * 400_000_000)) + 1n);
  const total = amounts.reduce((a, b) => a + b, 0n);
  const total_cap = total + 1_000_000n;
  inputs.cap_check = {
    per_tx_cap: per_tx_cap.toString(),
    total_cap: total_cap.toString(),
    amounts: amounts.map(String),
  };
}

// Idiomatic Noir variants (Poseidon2): same private inputs, public output
// is computed by the circuit itself.
inputs.poseidon2_chain = { seed: inputs.poseidon_chain.seed };
{
  const { root, ...rest } = inputs.merkle20;
  inputs.merkle20_poseidon2 = rest;
}

// --- write ---
const toToml = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => (Array.isArray(v) ? `${k} = [${v.map((x) => `"${x}"`).join(', ')}]` : `${k} = "${v}"`))
    .join('\n') + '\n';

mkdirSync(join(root, 'inputs'), { recursive: true });
for (const [name, obj] of Object.entries(inputs)) {
  writeFileSync(join(root, 'inputs', `${name}.json`), JSON.stringify(obj, null, 1) + '\n');
  writeFileSync(join(root, 'circuits/noir', name, 'Prover.toml'), toToml(obj));
}
console.log('wrote inputs for', Object.keys(inputs).join(', '));
