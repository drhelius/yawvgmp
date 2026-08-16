import workletUrl from './audio-worklet.ts?worker&url';
import type { WorkletRequest, WorkletResponse } from './types';

export class AudioEngine {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private statusTimer = 0;

  async initialize(onMessage: (message: WorkletResponse) => void): Promise<void> {
    if (!('WebAssembly' in window) || !('AudioContext' in window) || !('audioWorklet' in AudioContext.prototype)) {
      throw new Error('This browser does not provide WebAssembly, Web Audio, and AudioWorklet support.');
    }
    this.context = new AudioContext({ latencyHint: 'interactive' });
    await this.context.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(this.context, 'libvgm-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.connect(this.context.destination);
    this.node.port.onmessage = (event: MessageEvent<WorkletResponse>) => onMessage(event.data);
    const wasmModuleUrl = new URL('./wasm/libvgm.js', document.baseURI).href;
    const wasmUrl = new URL('./wasm/libvgm.wasm', document.baseURI).href;
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Unable to load libvgm.wasm (${response.status}).`);
    }
    const wasmBinary = await response.arrayBuffer();
    this.send({
      type: 'init',
      wasmModuleUrl,
      wasmBinary,
      sampleRate: this.context.sampleRate,
    }, [wasmBinary]);
    this.statusTimer = window.setInterval(() => this.send({ type: 'status' }), 100);
  }

  send(message: WorkletRequest, transfer: Transferable[] = []): void {
    this.node?.port.postMessage(message, transfer);
  }

  async resume(): Promise<boolean> {
    if (this.context === null) {
      return false;
    }
    await this.context.resume();
    return this.context.state === 'running';
  }

  get contextState(): AudioContextState | 'closed' {
    return this.context?.state ?? 'closed';
  }

  dispose(): void {
    window.clearInterval(this.statusTimer);
    this.send({ type: 'dispose' });
    this.node?.disconnect();
    void this.context?.close();
    this.node = null;
    this.context = null;
  }
}
