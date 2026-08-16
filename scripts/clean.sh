#!/bin/sh

set -eu

WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

rm -rf "$WEB_DIR/build" "$WEB_DIR/dist"
rm -f "$WEB_DIR/public/wasm/libvgm.js" "$WEB_DIR/public/wasm/libvgm.wasm"
