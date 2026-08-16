import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (inputPath === undefined || outputPath === undefined) {
  throw new Error('Usage: prepare-wasm-module.mjs <input> <output>');
}

const source = await readFile(inputPath, 'utf8');
await writeFile(outputPath, `const self = globalThis;\n${source}`);
