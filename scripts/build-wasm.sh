#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR="$ROOT_DIR/build/wasm"
EM_CACHE="$ROOT_DIR/build/emscripten-cache"
export EM_CACHE

"$ROOT_DIR/scripts/setup-libvgm.sh"

if command -v emcmake >/dev/null 2>&1
then
	EMCMAKE_BIN=$(command -v emcmake)
elif [ -n "${EMSDK:-}" ] && [ -x "$EMSDK/upstream/emscripten/emcmake" ]
then
	EMCMAKE_BIN="$EMSDK/upstream/emscripten/emcmake"
elif [ -x /opt/homebrew/opt/emscripten/bin/emcmake ]
then
	EMCMAKE_BIN=/opt/homebrew/opt/emscripten/bin/emcmake
else
	echo "Emscripten was not found. Activate emsdk_env.sh or add emcmake to PATH." >&2
	exit 1
fi

set -- "$EMCMAKE_BIN" cmake -S "$ROOT_DIR" -B "$BUILD_DIR" \
	-DCMAKE_BUILD_TYPE=Release \
	-DCMAKE_C_FLAGS="-O3 -flto -sUSE_ZLIB=1" \
	-DCMAKE_CXX_FLAGS="-O3 -flto -sUSE_ZLIB=1" \
	-DYAWVGMP_BUILD_TESTS=OFF

if [ -n "${YAWVGMP_LIBVGM_SOURCE_DIR:-}" ]
then
	set -- "$@" "-DYAWVGMP_LIBVGM_SOURCE_DIR=$YAWVGMP_LIBVGM_SOURCE_DIR"
fi

"$@"

cmake --build "$BUILD_DIR" --config Release --target vgm-web --parallel

mkdir -p "$ROOT_DIR/src/generated" "$ROOT_DIR/public/wasm"
node "$ROOT_DIR/scripts/prepare-wasm-module.mjs" \
	"$BUILD_DIR/wasm-module/libvgm.js" "$ROOT_DIR/src/generated/libvgm.js"
cp "$BUILD_DIR/wasm-module/libvgm.wasm" "$ROOT_DIR/public/wasm/libvgm.wasm"
