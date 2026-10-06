# ProveBench

Live: https://provebench.vercel.app

**How fast is ZK proving, really? The same statements and inputs, proved by different systems, on a laptop, in a browser and on your phone.**

ProveBench is an open benchmark for developers choosing a proving stack. It runs identical workloads (Poseidon hash chains, a depth-20 Merkle proof, SHA-256 of 1 KiB, ECDSA secp256k1, a spending-cap check) through Noir/UltraHonk and Circom/Groth16, natively and in the browser, and reports witness time, proving time, verification time, proof size and peak memory, with the conditions each number was measured under.

```text
$ npm run bench -- --reps 7 --cooldown 15 --note "..."
[provebench] machine macbook-air-m4-16gb, reps 7, load 3.99 5.69 4.96
[provebench] poseidon_chain / noir-ultrahonk ... (host busy 18.9% before cell)
[provebench]   witness 211 ms, prove 931.66 ms (p90 1053.55), verify 20.15 ms, proof 16256 B  [10307 ms]
[provebench] poseidon_chain / circom-rapidsnark ... (host busy 18.9% before cell)
[provebench]   witness 22.93 ms, prove 118.63 ms (p90 123.11), verify 4.62 ms, proof 256 B  [1642 ms]
[provebench] merkle20 / circom-rapidsnark ... (host busy 23.9% before cell)
[provebench]   witness 8.14 ms, prove 34.23 ms (p90 35.87), verify 4.37 ms, proof 256 B  [500 ms]
[provebench] sha256_1k / noir-ultrahonk ... (host busy 30.5% before cell)
[provebench]   witness 24.42 ms, prove 686.38 ms (p90 696.83), verify 19.45 ms, proof 16256 B  [6247 ms]
```

(Excerpt of the real reference run, `results/logs/2026-10-04-run3.log`.)

## Why

Proving-system comparisons usually come from the teams that build the provers, use different circuits for each system, and are run on a server. If you are deciding what to prove on a user's laptop or phone, you need the same statement in each system and numbers from the device class you ship to. The first reference run of this repo also showed how fragile laptop numbers are: the same machine under background load took about twice as long on most cells (see [Methodology](#methodology)), so every result here carries its load conditions.

## Results

Reference machine: MacBook Air M4 (10 cores: 4 performance + 6 efficiency, 16 GB, fanless, macOS 27.0, on battery).

- **Native**: 2026-10-04 13:37 UTC. 7 timed reps per cell after 1 warmup, 15 s cooldown between cells. Load average at start 3.99 / 5.69 / 4.96. Host CPU busy before each cell (other processes only) 13 to 31%: a browser, a terminal and two coding-agent sessions were open. Not an idle lab.
- **Browser**: 2026-10-04 20:01 UTC. Chrome 154 (headless, driven by Playwright, fresh profile) against the production build on localhost, 10 WASM threads, 3 timed reps after 1 warmup. Started once host CPU busy stayed under 25%; load average 9.62 / 17.44 / 17.79 at start, still decaying from earlier work by another session. Two short bursts from other processes during the 90 s run are listed in the result's `note` and `host_samples`.

Median prove time, with p90 in brackets.

| Workload | bb native (UltraHonk) | rapidsnark (Groth16) | snarkjs Node (Groth16) | Chrome bb.js (UltraHonk) | Chrome snarkjs (Groth16) |
|---|---:|---:|---:|---:|---:|
| poseidon_chain | 932 ms (1.05 s) | 119 ms (123 ms) | 831 ms (862 ms) | 2.25 s (2.33 s) | 1.04 s (1.14 s) |
| merkle20 | 460 ms (479 ms) | 34 ms (36 ms) | 235 ms (247 ms) | 1.02 s (1.25 s) | 255 ms (264 ms) |
| sha256_1k | 686 ms (697 ms) | 573 ms (585 ms) | 6.30 s (6.89 s) | 2.01 s (2.18 s) | 8.52 s (10.71 s) |
| ecdsa_secp256k1 | 396 ms (690 ms) | n/a | n/a | 1.19 s (1.19 s) | n/a |
| cap_check | 82 ms (82 ms) | 17 ms (18 ms) | 97 ms (99 ms) | 138 ms (142 ms) | 101 ms (125 ms) |
| poseidon2_chain (variant) | 128 ms (146 ms) | n/a | n/a | not in browser suite | n/a |
| merkle20_poseidon2 (variant) | 93 ms (93 ms) | n/a | n/a | 251 ms (252 ms) | n/a |

Full detail (witness, verify, proof size, peak memory, every sample): [`results/macbook-air-m4-16gb.md`](results/macbook-air-m4-16gb.md), [`results/browser/`](results/browser/), [`results/SUMMARY.md`](results/SUMMARY.md).

What the numbers say, on this one machine:

- **Poseidon-heavy circuits favour Groth16.** circomlib Poseidon is about 240 R1CS constraints per hash; the same Poseidon in Noir costs about 920 UltraHonk gates. Native rapidsnark proves the depth-20 Merkle path in 34 ms, bb in 460 ms.
- **Use the native hash and that gap mostly closes.** With Poseidon2, the Noir Merkle proof drops from 37,262 to 3,044 gates and from 460 ms to 93 ms.
- **SHA-256 flips it.** 72k UltraHonk gates (lookup tables) against 522k R1CS constraints. Native proving is close (bb 686 ms, rapidsnark 573 ms), but Circom's witness generation alone takes 760 ms, so end to end bb is faster: 711 ms against 1.33 s. snarkjs needs 6.3 s and 4.6 GB of memory. In Chrome the gap is wider: bb.js 2.01 s against snarkjs 8.52 s, plus a 290 MB key download for snarkjs.
- **"Groth16 speed" depends on which prover you mean.** On the same zkey, rapidsnark is 6 to 11x faster than snarkjs.
- **Proof size and verification**: Groth16 proofs are 256 B and verify in about 5 ms; UltraHonk proofs here are 16,256 B and verify in about 20 ms with the `bb` CLI.
- **Load matters as much as the prover.** Under background load (1-minute load 9 to 11), the same suite measured bb at 2.00 s on poseidon_chain and snarkjs at 12.5 s on SHA-256, about 2x the numbers above. That run is kept in [`results/archive/2026-10-04-loaded/`](results/archive/2026-10-04-loaded/).

## Quickstart

To run the browser suite on your own device with nothing to install, open [provebench.vercel.app](https://provebench.vercel.app) and press "Run benchmark". The hosted build has every circuit and key except the SHA-256 Groth16 key (about 290 MB, not committed), so that one cell is not offered there.

To run the native benchmark, prerequisites: Node 20+, `nargo` 1.0.0-beta.19 (`noirup -v 1.0.0-beta.19`), `bb` 4.0.0-nightly.20260120 (`bbup -v 4.0.0-nightly.20260120`). macOS or Linux.

```bash
git clone https://github.com/agnij-dutta/provebench && cd provebench
npm install
bash scripts/get-rapidsnark.sh                      # native Groth16 prover (iden3 prebuilt)
npm run bench -- --reps 3 --workloads merkle20,cap_check --machine my-run
cat results/my-run.md                               # the table for your machine
```

Compiled circuits, inputs and all Groth16 keys except SHA-256 are committed, so this needs no circom install and no trusted-setup download. The run writes `results/my-run.json` and `results/my-run.md`. Without `--machine`, the file name is derived from your hardware, and the runner refuses to overwrite an existing file.

Browser suite:

```bash
cd web
npm install
npm run dev        # http://localhost:5173, then press "Run benchmark"
```

## Usage

### Native runner

`npm run bench -- [flags]` (or `node bench/run.mjs [flags]`):

| Flag | Default | Meaning |
|---|---|---|
| `--reps N` | `5` | timed repetitions per cell, after one untimed warmup |
| `--workloads a,b` | all | `poseidon_chain`, `merkle20`, `sha256_1k`, `ecdsa_secp256k1`, `cap_check`, `poseidon2_chain`, `merkle20_poseidon2` |
| `--systems x,y` | all | `noir-ultrahonk`, `circom-rapidsnark`, `circom-snarkjs` |
| `--machine id` | derived from model, chip and RAM | name of the output files in `results/` |
| `--cooldown S` | `0` | seconds to sleep between cells (useful on fanless or thermally limited machines) |
| `--note "text"` | none | what else was running; printed with every table |
| `--merge` | off | re-run some cells and keep the rest of an existing results file |
| `--overwrite` | off | replace an existing results file (without it, or `--merge`, the runner refuses) |

The runner exits non-zero if any cell fails to build, prove or verify. Cells whose keys are missing (for example the SHA-256 Groth16 zkey) are skipped with a message.

### Scripts

| Command | What it does |
|---|---|
| `npm run inputs` | regenerate `inputs/*.json` and `Prover.toml` files (deterministic; output is committed) |
| `npm run build:noir` | compile Noir circuits into `artifacts/noir/` (strips build-machine paths) |
| `npm run build:circom [-- names]` | compile Circom circuits and run the Groth16 setup; needs `circom` 2.2.x |
| `bash scripts/build-circom.sh sha256_1k` | build the ~290 MB SHA-256 zkey, which is not committed |
| `node scripts/sizes.mjs` | count UltraHonk gates and R1CS constraints into `artifacts/circuit-sizes.json` |
| `node scripts/summarize.mjs` | write `results/SUMMARY.md` from all native and browser results |
| `npm run lint` / `npm run format` / `npm run format:check` | ESLint; Prettier plus `nargo fmt` |
| `npm run web:dev` / `npm run web:build` | browser suite dev server / production build |

There are no environment variables. Tools are found on `PATH` (`nargo`, `bb`, `circom`); rapidsnark is found in `build/tools/`.

### Browser suite

```bash
cd web
npm install
npm run dev        # dev server with COOP/COEP headers, so multithreaded WASM works
npm run build      # static site in web/dist
npm run preview    # serve the production build with the right headers
```

The page detects the device (user agent, `hardwareConcurrency`, `deviceMemory`, cross-origin isolation), runs Noir (noir_js + bb.js UltraHonk) and Circom (snarkjs Groth16) on the same artifacts and inputs as the native runner with a warmup plus 1, 3 or 5 timed reps, ranks the device against the bundled reference runs, and exports a share card and a result JSON (`provebench/browser@1`). SHA-256 Groth16 is opt-in because its key is a ~290 MB download, and is only offered if you built that key locally.

On a phone: `npm run dev -- --host` and open the LAN URL. Browsers only allow multithreaded WASM (`SharedArrayBuffer`) on secure contexts, so plain `http://<lan-ip>` runs single-threaded. For a fair phone run, use an HTTPS tunnel such as `cloudflared tunnel --url http://localhost:5173`.

Automation: `/?autorun=1&reps=3` runs the default suite on load and exposes the result as `window.__provebench`.

Hosting: any static host works if it sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (`web/public/_headers` for Netlify or Cloudflare Pages, the root `vercel.json` for Vercel). The hosted copy at https://provebench.vercel.app deploys from `main` with that `vercel.json`.

## Submitting a result

- **Browser**: run the suite, click "Export result JSON", and open a PR adding the file to `results/browser/`. Add a `note` field saying what else was running, and fill in `device.model` if the browser did not detect it.
- **Native**: `npm run bench -- --reps 7 --cooldown 15 --note "<what else was running>"`, then `node scripts/summarize.mjs`, and open a PR with `results/<machine>.json`, `results/<machine>.md` and `results/SUMMARY.md`.

There is no submission backend yet; the next build bundles merged results into the page's leaderboard. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Methodology

**Workloads.** Every workload is one statement with the same public/private split in each system, and every system reads the same inputs (`inputs/*.json`, generated deterministically by `scripts/gen-inputs.mjs`).

| Workload | Statement | Noir (UltraHonk gates) | Circom (R1CS constraints, `--O2`) |
|---|---|---:|---:|
| `poseidon_chain` | 100 sequential Poseidon(h, i) hashes from a private seed end at a public value | 92,256 | 23,700 |
| `merkle20` | a private leaf is in a depth-20 Poseidon Merkle tree with a public root | 37,262 | 4,840 |
| `sha256_1k` | SHA-256 of a private 1024-byte message equals a public digest | 72,215 | 522,393 |
| `ecdsa_secp256k1` | a secp256k1 ECDSA signature over a hash verifies under a public key | 42,180 | not built |
| `cap_check` | 16 private u64 payments: each at most a public per-tx cap, every running total at most a public budget | 3,128 | 4,224 |
| `poseidon2_chain` (variant) | the chain above with Poseidon2, Noir only | 7,457 | n/a |
| `merkle20_poseidon2` (variant) | the tree above with Poseidon2, Noir only | 3,044 | n/a |

Poseidon is the circomlib-compatible BN254 instance in both systems (Noir uses `noir-lang/poseidon` `bn254::hash_2`), so hash outputs match bit for bit: the Noir circuits assert against roots computed with `circomlibjs`. The two variant rows use Poseidon2, which Barretenberg proves with a dedicated gate. They show what idiomatic Noir costs and are kept out of the like-for-like comparison. `cap_check` is the agent spending-mandate primitive: an agent proves a batch of payments respects a per-payment cap and a cumulative budget without revealing the amounts.

Gates and constraints are different units. An UltraHonk gate is a wide PLONKish row with lookups; an R1CS constraint is one rank-1 product. Compare times, not sizes.

**What is timed.**

| Phase | Noir / UltraHonk | Circom / Groth16 |
|---|---|---|
| Witness | `noir_js` (ACVM in WASM) in Node, in process, after a warmup | snarkjs `wtns.calculate` (circom WASM) in Node, in process, after a warmup |
| Prove | `bb prove` CLI, wall clock including process start and CRS load | rapidsnark `prover` CLI (including zkey load), or snarkjs in Node in process |
| Verify | `bb verify` CLI | rapidsnark `verifier` CLI, or snarkjs in Node |
| Peak memory | max RSS from `/usr/bin/time` | max RSS from `/usr/bin/time`, or `getrusage` for the snarkjs worker |
| Proof size | bytes of `bb`'s proof file | 256 B (A, B, C as uncompressed BN254 points) |

Each cell runs one warmup and N timed reps; the result files hold the median, p90, min, max and every sample. Every proof is verified, and a failed verification fails the cell.

**Host conditions.** Each native result records the machine (model, chip, core counts, memory, OS, Node, power source), the toolchain versions, the load average at start and end, the 1-minute load before each cell, and the host CPU busy % over one second sampled while the benchmark is idle just before each cell. The busy % is the useful number: `os.loadavg()` also counts the benchmark's own threads (bb and rapidsnark use every core), so per-cell load climbs during a run even on a quiet machine. Each result also carries a free-text note saying what else was running.

**Toolchain.**

| System | Native prover | Browser prover | Arithmetization |
|---|---|---|---|
| Noir 1.0.0-beta.19 | `bb` 4.0.0-nightly.20260120 (UltraHonk) | `@aztec/bb.js` same version | UltraHonk (PLONKish with lookups) |
| Circom 2.2.2 | rapidsnark v0.0.8, and snarkjs 0.7.6 in Node | snarkjs 0.7.6 | R1CS, Groth16 on BN254 |

**Trusted setup.** Groth16 keys use the PSE perpetual powers of tau (`ppot_0080`, 2^13, 2^15 and 2^19) and a bare phase 2 (`snarkjs groth16 setup`, no contribution). Proving cost is identical to a real ceremony, so it is fine for benchmarking, but it is **not a secure setup**: anyone can forge proofs for these keys.

## Included, excluded, and why

Included: two mainstream stacks developers choose between today (Noir/UltraHonk and Circom/Groth16), with two Groth16 provers to show how much the prover implementation matters, and workloads that cover hashing (algebraic and bitwise), membership proofs, signatures and range-style arithmetic.

Excluded for now:

- **Circom ECDSA secp256k1.** 0xPARC `circom-ecdsa` is about 1.5M constraints and needs a 2^21 ptau and a GB-scale zkey.
- **zkVMs (SP1, RISC Zero).** Each toolchain is several GB, and they prove a different thing (program execution), so they need their own workload definitions to be fair.
- **Halo2, Plonky3, Gnark.** Planned; each needs equivalent circuits written and checked.
- **Mobile-native provers** (mopro, Swoir). Needed to separate "phone" from "phone browser".

## How it works

```text
scripts/gen-inputs.mjs ──> inputs/*.json ──┬──> circuits/noir/*  ──nargo──> artifacts/noir/*.json ──┐
                                           └──> circuits/circom/* ─circom─> artifacts/circom/*      │
                                                                                                    v
                              bench/run.mjs (native: bb, rapidsnark, snarkjs) ──> results/<machine>.{json,md}
                              web/ (browser: bb.js, snarkjs)                  ──> exported JSON ──> results/browser/
                                                                                                    v
                                                          scripts/summarize.mjs ──> results/SUMMARY.md
```

The native runner spawns the prover CLIs under `/usr/bin/time` for wall clock and peak memory, and runs witness generation and snarkjs in Node worker processes so each gets a clean heap. The web app (`web/`) is a static Vite site. `web/scripts/sync-artifacts.mjs` copies the same artifacts, inputs and reference results into the site at build time, so the browser proves exactly what the native runner proves.

## Limitations

- One reference machine so far, and it is a shared laptop, not an idle lab. Numbers are labelled with their conditions; do not compare them with numbers from other machines without reading those conditions.
- The `bb` and rapidsnark timings include process start and key loading, which favours in-process provers on very small circuits. snarkjs timings are in process.
- Browser verify for bb.js includes rebuilding the verification key, so it is not comparable with native verify.
- Groth16 keys come from an insecure setup (see above). The circuits are benchmark circuits, not audited production code.
- Results are self-reported JSON files; review is the only check against fake submissions.

## Prior art

- [zk-Bench (Ernstberger et al., 2023)](https://eprint.iacr.org/2023/1503): an academic framework comparing SNARK arithmetic and circuit costs across libraries.
- [Delendum zk-benchmarking](https://github.com/delendum-xyz/zk-benchmarking) and [Brevis (formerly Celer) zk-benchmark](https://github.com/brevis-network/zk-benchmark): comparisons of zero-knowledge proof libraries and frameworks, run natively.
- [mopro](https://zkmopro.org): mobile proving toolkit with its own native mobile benchmarks.

ProveBench adds a browser suite anyone can run on their own device with the same artifacts as the native runner, Noir/UltraHonk next to Circom/Groth16 on identical inputs, and recorded host conditions on every number.

## Roadmap

- Circom ECDSA secp256k1.
- zkVM rows (SP1, RISC Zero) with execution-based workloads.
- Halo2, Plonky3 and Gnark rows.
- Mobile-native provers (mopro, Swoir).
- A submission endpoint and a public leaderboard.
- Reference runs on an idle machine, Linux x86 and Android devices.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, how to add a workload or proving system while keeping implementations equivalent, and how to submit results. Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Copyright (c) 2026 Agnij Dutta.

## Author

Agnij Dutta ([@0xholmesdev](https://x.com/0xholmesdev), [github.com/agnij-dutta](https://github.com/agnij-dutta)).
