# ProveBench native results: MacBook Air (Apple M4, 16 GB)

- Run: 2026-10-04T07:01:34.811Z to 2026-10-04T07:05:24.159Z, 7 reps per cell after 1 warmup
- CPU: 10 cores (4P + 6E), Darwin 27.0, Node v22.14.0
- Toolchain: nargo 1.0.0-beta.19, bb 4.0.0-nightly.20260120, circom 2.2.2, snarkjs 0.7.6, rapidsnark macOS-arm64-v0.0.8 (iden3 prebuilt)
- Load average at start: 9.03 / 13.72 / 20.57, at end: 9.47 / 11.69 / 18.07 (1/5/15 min)
- **Caveat:** os.loadavg() 1/5/15 min. This machine routinely runs other workloads (parallel dev sessions) during benchmarks; numbers are real-world, not an idle lab.

| Workload | System | Size | Witness (med) | Prove (med) | Prove (p90) | Verify (med) | Proof | Peak RSS (prove) | Load 1m |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| poseidon_chain | noir-ultrahonk | 92,256 gates | 475 ms | **2.00 s** | 2.05 s | 42 ms | 16,256 B | 336 MB | 9.03 |
| poseidon_chain | circom-rapidsnark | 23,700 constraints | 45 ms | **296 ms** | 313 ms | 12 ms | 256 B | 31 MB | 10.73 |
| poseidon_chain | circom-snarkjs | 23,700 constraints | 52 ms | **1.96 s** | 2.02 s | 13 ms | 256 B | 851 MB | 10.27 |
| merkle20 | noir-ultrahonk | 37,262 gates | 196 ms | **1.02 s** | 1.04 s | 43 ms | 16,256 B | 156 MB | 10.73 |
| merkle20 | circom-rapidsnark | 4,840 constraints | 18 ms | **75 ms** | 76 ms | 9.71 ms | 256 B | 8 MB | 10.94 |
| merkle20 | circom-snarkjs | 4,840 constraints | 19 ms | **515 ms** | 530 ms | 13 ms | 256 B | 560 MB | 10.94 |
| sha256_1k | noir-ultrahonk | 72,215 gates | 66 ms | **1.54 s** | 1.61 s | 43 ms | 16,256 B | 243 MB | 11.35 |
| sha256_1k | circom-rapidsnark | 522,393 constraints | 1.47 s | **1.46 s** | 1.62 s | 12 ms | 256 B | 545 MB | 10.94 |
| sha256_1k | circom-snarkjs | 522,393 constraints | 1.51 s | **12.53 s** | 12.74 s | 10 ms | 256 B | 6062 MB | 9.91 |
| ecdsa_secp256k1 | noir-ultrahonk | 42,180 gates | 5.26 ms | **862 ms** | 903 ms | 43 ms | 16,256 B | 111 MB | 10.7 |
| cap_check | noir-ultrahonk | 3,128 gates | 3.25 ms | **181 ms** | 184 ms | 37 ms | 16,256 B | 20 MB | 10.64 |
| cap_check | circom-rapidsnark | 4,224 constraints | 13 ms | **35 ms** | 37 ms | 9.49 ms | 256 B | 9 MB | 10.19 |
| cap_check | circom-snarkjs | 4,224 constraints | 14 ms | **227 ms** | 249 ms | 13 ms | 256 B | 538 MB | 10.19 |
| poseidon2_chain | noir-ultrahonk | 7,457 gates | 11 ms | **304 ms** | 329 ms | 42 ms | 16,256 B | 27 MB | 10.19 |
| merkle20_poseidon2 | noir-ultrahonk | 3,044 gates | 5.62 ms | **230 ms** | 239 ms | 43 ms | 16,256 B | 20 MB | 9.85 |

Notes:

- `noir-ultrahonk`: proof timed as a native `bb prove` CLI call (includes process start and CRS load). Witness via noir_js in Node.
- `circom-rapidsnark`: Groth16 via the native rapidsnark CLI (includes zkey load). Witness via snarkjs (circom WASM) in Node.
- `circom-snarkjs`: Groth16 via snarkjs in Node, in-process after warmup.
- Rows marked `Variant` use Poseidon2 (Noir-native) instead of circomlib Poseidon, so they are not like-for-like with Circom.
- ECDSA secp256k1 has no Circom row: circom-ecdsa is ~1.5M constraints and needs a 2^21 ptau and a GB-scale zkey (see TODO).
- Groth16 setup is a bare phase 2 (no contribution). Fine for timing, not a secure setup.
