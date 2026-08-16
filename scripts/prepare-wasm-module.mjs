import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (inputPath === undefined || outputPath === undefined) {
  throw new Error('Usage: prepare-wasm-module.mjs <input> <output>');
}

const source = await readFile(inputPath, 'utf8');
const workletSource = source.replaceAll('import.meta.url', "globalThis.location?.href ?? ''");
if (workletSource === source) {
  throw new Error('The Emscripten module did not contain the expected import.meta.url references.');
}
await writeFile(outputPath, workletSource);
