#!/usr/bin/env bash
# Compiles every Noir circuit with nargo and copies the ACIR JSON to artifacts/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts/noir
for d in circuits/noir/*/; do
  c=$(basename "$d")
  (cd "$d" && nargo compile --silence-warnings)
  # Drop debug_symbols and file_map: they embed absolute source paths from the
  # build machine and are not needed to execute or prove.
  node -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);const j=JSON.parse(fs.readFileSync(src,"utf8"));delete j.debug_symbols;delete j.file_map;fs.writeFileSync(dst,JSON.stringify(j));' "$d/target/$c.json" "artifacts/noir/$c.json"
  echo "compiled $c"
done
