#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ -n "${YAWVGMP_LIBVGM_SOURCE_DIR:-}" ]
then
	if [ ! -f "$YAWVGMP_LIBVGM_SOURCE_DIR/player/vgmplayer.cpp" ]
	then
		echo "YAWVGMP_LIBVGM_SOURCE_DIR is not a libvgm source checkout: $YAWVGMP_LIBVGM_SOURCE_DIR" >&2
		exit 1
	fi
	exit 0
fi

if [ -f "$ROOT_DIR/libvgm/player/vgmplayer.cpp" ]
then
	exit 0
fi

if ! command -v git >/dev/null 2>&1 || ! git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1
then
	echo "libvgm is missing. Clone yawvgmp with --recurse-submodules or set YAWVGMP_LIBVGM_SOURCE_DIR." >&2
	exit 1
fi

echo "Initializing the pinned libvgm submodule..."
git -C "$ROOT_DIR" submodule update --init --recursive

if [ ! -f "$ROOT_DIR/libvgm/player/vgmplayer.cpp" ]
then
	echo "The libvgm submodule could not be initialized." >&2
	exit 1
fi
