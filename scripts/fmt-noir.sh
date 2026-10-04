#!/usr/bin/env bash
# Runs `nargo fmt` over every Noir package. Pass --check to fail on unformatted code.
set -euo pipefail
cd "$(dirname "$0")/.."
for d in circuits/noir/*/; do
  (cd "$d" && nargo fmt "$@")
done
