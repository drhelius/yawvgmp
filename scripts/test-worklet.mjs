import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const rootDirectory = new URL('../', import.meta.url);
const assetDirectory = new URL('dist/assets/', rootDirectory);
const wasmUrl = new URL('dist/wasm/libvgm.wasm', rootDirectory);
const assets = await readdir(assetDirectory);
const worklets = assets.filter((name) => name.startsWith('audio-worklet-') && name.endsWith('.js'));
if (worklets.length !== 1) {
  throw new Error(`Expected one built AudioWorklet, found ${worklets.length}.`);
}

delete globalThis.self;
delete globalThis.location;
let Processor;
globalThis.AudioWorkletProcessor = class {
  port = {
    onmessage: null,
    postMessage: () => {},
  };
};
globalThis.registerProcessor = (_name, processor) => {
  Processor = processor;
};

const workletUrl = new URL(worklets[0], assetDirectory);
await import(`${pathToFileURL(workletUrl.pathname).href}?test=${Date.now()}`);
if (Processor === undefined) {
  throw new Error('The AudioWorklet processor was not registered.');
}

const result = await new Promise((resolve, reject) => {
  const instance = new Processor();
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for engine-ready.')), 5000);
  instance.port.postMessage = (message) => {
    if (message.type === 'error') {
      clearTimeout(timeout);
      reject(new Error(message.message));
    } else if (message.type === 'engine-ready') {
      clearTimeout(timeout);
      resolve(message);
    }
  };
  readFile(wasmUrl).then((bytes) => {
    const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    instance.port.onmessage({ data: { type: 'init', wasmBinary, sampleRate: 48000 } });
  }).catch(reject);
});

console.log(`AudioWorklet ready without self/location: ${result.devices} devices / ${result.cores} cores`);
