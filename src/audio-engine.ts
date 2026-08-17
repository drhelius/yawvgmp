import workletUrl from './audio-worklet.ts?worker&url';
import type { WorkletRequest, WorkletResponse } from './types';

export interface AudioLevels {
  low: number;
  mid: number;
  high: number;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Float32Array<ArrayBuffer> | null = null;
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
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -20;
    this.analyser.smoothingTimeConstant = 0.2;
    this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    this.node.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.node.port.onmessage = (event: MessageEvent<WorkletResponse>) => onMessage(event.data);
    const wasmUrl = new URL('./wasm/libvgm.wasm', document.baseURI).href;
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Unable to load libvgm.wasm (${response.status}).`);
    }
    const wasmBinary = await response.arrayBuffer();
    this.send({
      type: 'init',
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

  getAudioLevels(): AudioLevels {
    if (this.analyser === null || this.context === null || this.frequencyData === null ||
        this.context.state !== 'running') {
      return { low: 0, mid: 0, high: 0 };
    }

    this.analyser.getFloatFrequencyData(this.frequencyData);
    const frequencyPerBin = this.context.sampleRate / this.analyser.fftSize;
    return {
      low: this.getBandLevel(40, 250, frequencyPerBin),
      mid: this.getBandLevel(250, 2000, frequencyPerBin),
      high: this.getBandLevel(2000, 8000, frequencyPerBin),
    };
  }

  private getBandLevel(minimum: number, maximum: number, frequencyPerBin: number): number {
    if (this.frequencyData === null) {
      return 0;
    }
    const first = Math.max(0, Math.ceil(minimum / frequencyPerBin));
    const last = Math.min(this.frequencyData.length, Math.floor(maximum / frequencyPerBin) + 1);
    let totalSquared = 0;
    for (let index = first; index < last; index += 1) {
      const decibels = this.frequencyData[index];
      const magnitude = Number.isFinite(decibels) ? Math.pow(10, decibels / 20) : 0;
      totalSquared += magnitude * magnitude;
    }
    return last > first ? Math.sqrt(totalSquared / (last - first)) : 0;
  }

  dispose(): void {
    window.clearInterval(this.statusTimer);
    this.send({ type: 'dispose' });
    this.node?.disconnect();
    this.analyser?.disconnect();
    void this.context?.close();
    this.node = null;
    this.analyser = null;
    this.frequencyData = null;
    this.context = null;
  }
}
