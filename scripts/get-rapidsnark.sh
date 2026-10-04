#!/usr/bin/env bash
# Downloads the iden3 prebuilt rapidsnark (native Groth16 prover) into build/tools.
set -euo pipefail
cd "$(dirname "$0")/.."
V=v0.0.8
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) P=macOS-arm64 ;;
  Darwin-x86_64) P=macOS-x86_64 ;;
  Linux-x86_64) P=linux-x86_64 ;;
  Linux-aarch64) P=linux-arm64 ;;
  *) echo "no prebuilt rapidsnark for this platform"; exit 1 ;;
esac
mkdir -p build/tools && cd build/tools
curl -sSfL -o rs.zip "https://github.com/iden3/rapidsnark/releases/download/$V/rapidsnark-$P-$V.zip"
unzip -oq rs.zip && rm rs.zip
xattr -dr com.apple.quarantine . 2>/dev/null || true
echo "installed build/tools/rapidsnark-$P-$V"
