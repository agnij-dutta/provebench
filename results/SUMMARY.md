# ProveBench summary

Median prove time. Witness generation and verification are in the per-machine files.

## MacBook Air (Apple M4, 16 GB)

Native load average at start: 9.03 / 13.72 / 20.57. Browser run: Reference run by the maintainer via vite preview on localhost. Device model filled in by hand (desktop Chrome does not expose it). Host load average (1/5/15 min) was 11.26 / 14.90 / 23.55 at start and 18.84 / 16.38 / 23.37 at end: other workloads were running. SHA-256 cells were run separately a few minutes later (opt-in heavy workload, 3 reps, host load 13.37 / 15.08 / 21.97 at start).

| Workload | Native bb (UltraHonk) | Native rapidsnark (Groth16) | snarkjs in Node (Groth16) | Chrome 154: bb.js (UltraHonk) | Chrome 154: snarkjs (Groth16) |
|---|---:|---:|---:|---:|---:|
| poseidon_chain | 2.00 s | 296 ms | 1.96 s | 4.66 s | 2.23 s |
| merkle20 | 1.02 s | 75 ms | 515 ms | 2.43 s | 523 ms |
| sha256_1k | 1.54 s | 1.46 s | 12.53 s | 3.68 s | 13.91 s |
| ecdsa_secp256k1 | 862 ms | n/a | n/a | 2.15 s | n/a |
| cap_check | 181 ms | 35 ms | 227 ms | 317 ms | 226 ms |
| poseidon2_chain | 304 ms | n/a | n/a | n/a | n/a |
| merkle20_poseidon2 | 230 ms | n/a | n/a | 479 ms | n/a |

`poseidon2_chain` and `merkle20_poseidon2` are Noir-only variants using Poseidon2, not like-for-like with Circom.
