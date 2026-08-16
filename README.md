# yawvgmp

Yet Another Web VGM Player is a static browser VGM/VGZ player powered by [drhelius/libvgm](https://github.com/drhelius/libvgm). Music files are read locally, copied once into WebAssembly memory, and never uploaded or sent over the network. The deployed application needs no Node.js, server application, database, URL rewriting, or cross-origin isolation.

## Formats and browser requirements

The player accepts `.vgm` and gzip-compressed `.vgz` files. The WebAssembly build includes the VGM parser and command processor, in-memory raw/gzip loading, resampling and mixing, GD3 metadata, and every sound device/core enabled by `SNDEMU__ALL`, including the C++14-based YM2414 ymfm core. Native audio drivers, command-line applications, file loading, threading, and platform audio/windowing code are not linked into the browser module.

Current Chrome, Edge, Firefox, Safari, Mobile Safari, and Chrome for Android are targeted. WebAssembly, Web Audio, and AudioWorklet are required. Audio starts only after a browser-accepted user interaction. A clear error is shown when those features are unavailable or the audio context cannot resume.

## Prerequisites

- Node.js 20 or newer and npm
- CMake 3.20 or newer
- Emscripten (`emcc` and `emcmake` on `PATH`)
- Git, including submodule support

Node.js, npm, CMake, Emscripten, and Git are build-time tools only. The deployed player is entirely static.

To install Emscripten with the upstream SDK:

```sh
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
. ./emsdk_env.sh
```

On macOS, Emscripten can alternatively be installed with `brew install emscripten`. The build script detects `emcmake` on `PATH`, an activated `$EMSDK`, and Homebrew's standard Apple Silicon installation.

## Clone and build

The recommended fresh-clone workflow is:

```sh
git clone --recurse-submodules https://github.com/drhelius/yawvgmp.git
cd yawvgmp
npm ci
./build-web.sh
```

The finished static site is written to `dist/`. To serve that build locally:

```sh
npm run preview
```

If yawvgmp was cloned without `--recurse-submodules`, initialize libvgm with either command below. The WASM build also does this automatically when needed.

```sh
git submodule update --init --recursive
npm run setup
```

The submodule is pinned to a reviewed libvgm commit from the `web-vgm-player` branch. That history includes the Atari Lynx Mikey timer counter/reset fixes. A normal build always uses the pinned commit, so it does not silently change when the remote branch advances.

To deliberately use another local libvgm checkout, set an override before building:

```sh
YAWVGMP_LIBVGM_SOURCE_DIR=/path/to/libvgm ./build-web.sh
```

## Development commands

Run commands from the repository root:

```sh
npm run setup       # initialize the libvgm submodule
npm run wasm        # build libvgm.js and libvgm.wasm
npm run dev         # start the Vite development server
npm test            # run frontend tests once
npm run build       # type-check and build the static frontend
npm run build:all   # build WASM, then build the frontend
npm run preview     # serve dist/ locally
npm run clean       # remove build/, dist/, and generated WASM
```

`./build-web.sh` is the top-level complete build and is equivalent to `npm run build:all`. The WASM build uses `-O3`, LTO, dead-code elimination, memory growth, modularized ES-module output, and Emscripten zlib. Vite uses `base: './'`, so production asset paths work from any Apache subdirectory.

For a clean release build:

```sh
npm ci
npm run clean
npm test
./build-web.sh
```

## Repository layout

- `libvgm/`: pinned libvgm Git submodule; do not copy it into `dist/`
- `wasm/`: browser C ABI, in-memory loaders, and Emscripten target
- `src/`: Preact UI, AudioWorklet, Web Audio integration, and Canvas background
- `public/`: Apache configuration and generated WASM input for Vite
- `scripts/`: submodule setup, WASM build, complete build, and cleanup
- `tests/`: native wrapper coverage for VGM/VGZ parsing and playback operations
- `dist/`: generated static deployment files

## Controls

- Open button or `O`: choose a local VGM/VGZ
- Drop a VGM/VGZ anywhere: load or replace the current track
- Space: play/pause
- Left/right: seek 5 seconds
- Up/down: change volume by 5%
- `M`: mute
- Escape: close errors or cancel the drag overlay

The stop control returns to the beginning. Seeking works while playing or paused. File, transport, seek, and volume controls are keyboard accessible and have visible focus states and screen-reader labels.

## Audio architecture

The UI creates one `AudioWorkletNode`, fetches the static WASM asset, and transfers its bytes once during initialization. The worklet loads the Emscripten ES module, instantiates WASM there without depending on `fetch` in the limited worklet global, owns the libvgm player handle, and performs all PCM rendering away from the UI thread. File parsing, VGZ decompression, sound-core initialization, metadata extraction, and seeking happen in worklet message handlers, never in `process()`. The callback renders the exact requested stereo frame count into preallocated float buffers. UI status/energy polling is independent of rendering, and volume changes use a per-block gain ramp.

The C ABI in `wasm/vgm_web.h` supports multiple instances and exposes lifecycle, in-memory loading, transport, seek/timing, completion, volume/mute, fixed-block PCM rendering, metadata, chip details, missing external resources, and meaningful errors. No libvgm C++ object crosses the ABI.

## External ROM and sample data

Some chips can request data not embedded in the VGM, such as the YRW801 sample ROM used by some OPL4 tracks. The wrapper records the chip/resource request and blocks playback with an explanation rather than silently producing known-incomplete audio. No copyrighted ROM data is included. The callback boundary is intentionally retained for a future local companion-file picker.

## Testing

Frontend utility tests:

```sh
npm test
```

Native wrapper tests exercise raw VGM and VGZ memory loading, invalid data, GD3 metadata, duration, chip enumeration, render, pause, seek, stop, and registry completeness:

```sh
cmake -S . -B /tmp/yawvgmp-test -DYAWVGMP_BUILD_TESTS=ON
cmake --build /tmp/yawvgmp-test --target yawvgmp-wrapper-test
ctest --test-dir /tmp/yawvgmp-test --output-on-failure
```

These commands use the pinned `libvgm/` submodule. Pass `-DYAWVGMP_LIBVGM_SOURCE_DIR=/path/to/libvgm` to test another local checkout.

For release qualification, use representative SN76489, YM2612, YM2151, AY-3-8910, Game Boy, NES, Mikey, PCM/sample, multi-chip, and VGZ tracks. Compare rendered duration and deterministic PCM hashes with native `vgm2wav` at 44.1, 48, and 96 kHz. Also test pause/resume, seeks, loop endings, long tracks, replacement loads, hidden tabs, high-DPI/mobile layouts, reduced motion, and browser audio resume behavior. Test files and any required ROMs are intentionally not distributed here.

## Static Apache hosting/Apache deployment

Run `./build-web.sh`, then upload the **contents** of `dist/` to the desired Apache hosting directory. The output consists only of HTML, CSS, JavaScript, WASM, and `.htaccess`.

For example, upload every file inside `dist/` to the selected Apache hosting web directory using SFTP, SCP, rsync, or the Apache hosting file manager. Do not upload `node_modules/`, `build/`, the libvgm submodule, or the TypeScript sources. Opening the deployed `index.html` needs no PHP, Node.js process, database, rewrite rule, or cross-origin isolation.

The included `.htaccess`:

- registers `application/wasm`
- enables Brotli and gzip/deflate when the corresponding Apache modules are available
- gives hashed Vite JavaScript/CSS long immutable caching
- gives WASM short revalidated caching
- prevents stale `index.html` deployments
- disables directory listings

If Apache hosting does not permit one of those directives, remove only the rejected block. No rewrite rules are required.

## Known limitations

- External ROM/sample companion files cannot yet be supplied; affected tracks are rejected with the resource name.
- Browser output sample rate is selected by the browser. libvgm's resamplers convert every chip to that rate.
- Browsers may suspend audio after backgrounding or device changes; pressing play resumes the context.
- Direct WebAssembly loading in AudioWorklet is used because it is supported by the target current browsers. A browser that blocks module loading in AudioWorklet receives a fatal initialization message rather than falling back to deprecated `ScriptProcessorNode`.
