#!/usr/bin/env bash
# Compiles the Circom circuits and runs a Groth16 setup for each.
# ptau: PSE perpetual powers of tau (ppot_0080), downloaded on demand.
# Phase 2 is the bare `groth16 setup` output with no contribution: identical
# proving cost, fine for benchmarking, NOT a secure trusted setup.
set -euo pipefail
cd "$(dirname "$0")/.."
SNARKJS="node --max-old-space-size=8192 node_modules/snarkjs/build/cli.cjs"
mkdir -p build/circom build/ptau artifacts/circom

ptau_for() {
  case "$1" in
    poseidon_chain) echo 15 ;;
    merkle20|cap_check) echo 13 ;;
    sha256_1k) echo 19 ;;
  esac
}

CIRCUITS="${*:-poseidon_chain merkle20 cap_check sha256_1k}"
for c in $CIRCUITS; do
  p=$(ptau_for "$c")
  ptau="build/ptau/ppot_0080_$p.ptau"
  if [ ! -f "$ptau" ]; then
    echo "downloading ptau 2^$p"
    curl -sSfL -o "$ptau" "https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_$p.ptau"
  fi
  echo "== $c (ptau 2^$p)"
  circom "circuits/circom/$c.circom" --O2 --r1cs --wasm -o build/circom | grep -E 'constraints|wires'
  $SNARKJS groth16 setup "build/circom/$c.r1cs" "$ptau" "artifacts/circom/$c.zkey" > /dev/null
  $SNARKJS zkey export verificationkey "artifacts/circom/$c.zkey" "artifacts/circom/$c.vkey.json" > /dev/null
  cp "build/circom/${c}_js/$c.wasm" "artifacts/circom/$c.wasm"
  ls -la "artifacts/circom/$c".*
done
