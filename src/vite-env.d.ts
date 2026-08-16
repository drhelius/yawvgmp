/// <reference types="vite/client" />

declare module '*?worker&url' {
  const url: string;
  export default url;
}

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare const sampleRate: number;
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;
