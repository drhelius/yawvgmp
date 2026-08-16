#!/bin/sh

set -eu

WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$WEB_DIR/scripts/build-wasm.sh"
cd "$WEB_DIR"
npm run build
node "$WEB_DIR/scripts/test-worklet.mjs"
