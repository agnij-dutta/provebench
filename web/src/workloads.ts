export type SystemId = 'noir-ultrahonk' | 'circom-groth16';

export interface Workload {
  id: string;
  label: string;
  short: string;
  blurb: string;
  noir: string | null;
  circom: string | null;
  heavy?: boolean;
  variant?: boolean;
  defaultOn: boolean;
}

export const WORKLOADS: Workload[] = [
  {
    id: 'merkle20',
    label: 'Merkle membership, depth 20',
    short: 'Merkle d20',
    blurb: 'Prove a leaf is in a 1M-leaf Poseidon tree. The workhorse of private airdrops, allowlists and mixers.',
    noir: 'merkle20',
    circom: 'merkle20',
    defaultOn: true,
  },
  {
    id: 'cap_check',
    label: 'Spend cap check',
    short: 'Cap check',
    blurb: '16 private payments, each under a per-tx cap, running total under a budget. The core of an agent spending mandate.',
    noir: 'cap_check',
    circom: 'cap_check',
    defaultOn: true,
  },
  {
    id: 'poseidon_chain',
    label: 'Poseidon hash chain, N = 100',
    short: 'Poseidon x100',
    blurb: '100 sequential Poseidon hashes (circomlib-compatible BN254 instance in both systems).',
    noir: 'poseidon_chain',
    circom: 'poseidon_chain',
    defaultOn: true,
  },
  {
    id: 'ecdsa_secp256k1',
    label: 'ECDSA secp256k1 verify',
    short: 'ECDSA k1',
    blurb: 'Verify an Ethereum-style signature in-circuit. Noir only: the Circom version is ~1.5M constraints.',
    noir: 'ecdsa_secp256k1',
    circom: null,
    defaultOn: true,
  },
  {
    id: 'sha256_1k',
    label: 'SHA-256 of 1 KiB',
    short: 'SHA-256 1K',
    blurb: 'Hash 1024 bytes. Circom needs 522k constraints and a ~290 MB proving key; Noir uses lookup tables.',
    noir: 'sha256_1k',
    circom: 'sha256_1k',
    heavy: true,
    defaultOn: false,
  },
  {
    id: 'merkle20_poseidon2',
    label: 'Variant: Merkle d20 with Poseidon2',
    short: 'Merkle P2',
    blurb: 'Same tree shape with Poseidon2, the hash Barretenberg proves natively. Not like-for-like with Circom.',
    noir: 'merkle20_poseidon2',
    circom: null,
    variant: true,
    defaultOn: true,
  },
];

export const SYSTEMS: Record<SystemId, { label: string; lib: string; color: string }> = {
  'noir-ultrahonk': { label: 'Noir / UltraHonk', lib: 'bb.js', color: 'var(--s-noir)' },
  'circom-groth16': { label: 'Circom / Groth16', lib: 'snarkjs', color: 'var(--s-circom)' },
};
