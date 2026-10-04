# ProveBench native results: MacBook Air (Apple M4, 16 GB)

- Run: 2026-10-04T13:37:29.074Z to 2026-10-04T13:43:04.924Z, 7 reps per cell after 1 warmup, 15 s cooldown between cells
- CPU: 10 cores (4P + 6E), Darwin 27.0, Node v22.14.0, Battery Power
- Toolchain: nargo 1.0.0-beta.19, bb 4.0.0-nightly.20260120, circom 2.2.2, snarkjs 0.7.6, rapidsnark macOS-arm64-v0.0.8 (iden3 prebuilt)
- Load average at start: 3.99 / 5.69 / 4.96, at end: 4.94 / 6.43 / 5.59 (1/5/15 min)
- Host conditions: os.loadavg() 1/5/15 min; the per-cell load also counts the benchmark's own threads. Not an idle lab: a browser, a terminal and two coding-agent sessions were open (no other benchmark or build). Machine on battery. See 'Host busy before' for what other processes used.

| Workload | System | Size | Witness (med) | Prove (med) | Prove (p90) | Verify (med) | Proof | Peak RSS (prove) | Host busy before | Load 1m |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| poseidon_chain | noir-ultrahonk | 92,256 gates | 211 ms | **932 ms** | 1.05 s | 20 ms | 16,256 B | 338 MB | 18.9% | 3.99 |
| poseidon_chain | circom-rapidsnark | 23,700 constraints | 23 ms | **119 ms** | 123 ms | 4.62 ms | 256 B | 29 MB | 18.9% | 5.07 |
| poseidon_chain | circom-snarkjs | 23,700 constraints | 23 ms | **831 ms** | 862 ms | 6.13 ms | 256 B | 875 MB | 17.2% | 4.71 |
| merkle20 | noir-ultrahonk | 37,262 gates | 87 ms | **460 ms** | 479 ms | 18 ms | 16,256 B | 155 MB | 21.5% | 6.88 |
| merkle20 | circom-rapidsnark | 4,840 constraints | 8.14 ms | **34 ms** | 36 ms | 4.37 ms | 256 B | 8 MB | 23.9% | 5.65 |
| merkle20 | circom-snarkjs | 4,840 constraints | 8.03 ms | **235 ms** | 247 ms | 5.22 ms | 256 B | 535 MB | 15.5% | 4.68 |
| sha256_1k | noir-ultrahonk | 72,215 gates | 24 ms | **686 ms** | 697 ms | 19 ms | 16,256 B | 241 MB | 30.5% | 4.23 |
| sha256_1k | circom-rapidsnark | 522,393 constraints | 760 ms | **573 ms** | 585 ms | 4.54 ms | 256 B | 545 MB | 13.3% | 5.12 |
| sha256_1k | circom-snarkjs | 522,393 constraints | 756 ms | **6.30 s** | 6.89 s | 4.04 ms | 256 B | 4564 MB | 27.3% | 5.31 |
| ecdsa_secp256k1 | noir-ultrahonk | 42,180 gates | 2.38 ms | **396 ms** | 690 ms | 19 ms | 16,256 B | 120 MB | 26.3% | 11.41 |
| cap_check | noir-ultrahonk | 3,128 gates | 1.34 ms | **82 ms** | 82 ms | 19 ms | 16,256 B | 20 MB | 21.3% | 10.16 |
| cap_check | circom-rapidsnark | 4,224 constraints | 5.59 ms | **17 ms** | 18 ms | 4.19 ms | 256 B | 8 MB | 20.6% | 8.27 |
| cap_check | circom-snarkjs | 4,224 constraints | 5.64 ms | **97 ms** | 99 ms | 5.04 ms | 256 B | 543 MB | 24% | 6.6 |
| poseidon2_chain | noir-ultrahonk | 7,457 gates | 4.31 ms | **128 ms** | 146 ms | 19 ms | 16,256 B | 26 MB | 21.7% | 5.57 |
| merkle20_poseidon2 | noir-ultrahonk | 3,044 gates | 2.69 ms | **93 ms** | 93 ms | 18 ms | 16,256 B | 20 MB | 17.1% | 5.2 |

Notes:

- Host busy before: CPU utilisation of the whole machine over 1 s, sampled while the benchmark was idle just before the cell. It measures other processes; load 1m does not, because it also counts the benchmark's own threads.
- `noir-ultrahonk`: proof timed as a native `bb prove` CLI call (includes process start and CRS load). Witness via noir_js in Node.
- `circom-rapidsnark`: Groth16 via the native rapidsnark CLI (includes zkey load). Witness via snarkjs (circom WASM) in Node.
- `circom-snarkjs`: Groth16 via snarkjs in Node, in-process after warmup.
- Rows marked `Variant` use Poseidon2 (Noir-native) instead of circomlib Poseidon, so they are not like-for-like with Circom.
- ECDSA secp256k1 has no Circom row: circom-ecdsa is ~1.5M constraints and needs a 2^21 ptau and a GB-scale zkey (see TODO).
- Groth16 setup is a bare phase 2 (no contribution). Fine for timing, not a secure setup.
