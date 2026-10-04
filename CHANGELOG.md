# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-05

### Added

- Workloads in Noir and Circom with shared, deterministic inputs: Poseidon chain (100 hashes), Merkle membership at depth 20, SHA-256 of 1 KiB, ECDSA secp256k1 (Noir only), and a 16-payment spend cap check. Two Noir-only Poseidon2 variants.
- Native runner (`bench/run.mjs`) for Noir/UltraHonk via `bb`, Circom/Groth16 via rapidsnark, and Circom/Groth16 via snarkjs in Node. Reports median and p90 witness, prove and verify time, proof size and peak memory, with machine specs and toolchain versions.
- Host conditions in every native result: load average, host CPU busy % sampled while the benchmark is idle before each cell, power source, a free-text note, and an optional cooldown between cells.
- Browser suite (Vite static site) running bb.js and snarkjs on the same artifacts and inputs, with a device ranking, a share card and result JSON export.
- Reference results for a MacBook Air M4 (native and Chrome 154). An earlier run taken under heavy host load is kept in `results/archive/`.
- ESLint, Prettier and `nargo fmt`; CI that lints, rebuilds circuits, runs a smoke bench and builds the web app.

### Changed

- Noir artifacts no longer embed `debug_symbols` and `file_map`, which contained absolute paths from the build machine.
