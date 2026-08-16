import createLibVgmModule from './generated/libvgm.js';
import type { LoadedTrack, Metadata, SoundChip, WorkletRequest, WorkletResponse } from './types';
import type { LibVgmModule } from './wasm-types';

const MAX_RENDER_FRAMES = 2048;
const MISSING_RESOURCE = 9;

class LibVgmProcessor extends AudioWorkletProcessor {
  private module: LibVgmModule | null = null;
  private handle = 0;
  private outputPointer = 0;
  private outputView: Float32Array | null = null;
  private playing = false;
  private paused = true;
  private finished = false;
  private targetGain = 1;
  private currentGain = 1;
  private muted = false;
  private energy = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletRequest>) => {
      void this.handleMessage(event.data);
    };
  }

  private post(message: WorkletResponse): void {
    this.port.postMessage(message);
  }

  private string(pointer: number): string {
    return pointer !== 0 && this.module !== null ? this.module.UTF8ToString(pointer) : '';
  }

  private refreshOutputView(): void {
    if (this.module !== null && this.outputPointer !== 0) {
      this.outputView = new Float32Array(
        this.module.HEAPF32.buffer,
        this.outputPointer,
        MAX_RENDER_FRAMES * 2,
      );
    }
  }

  private async initialize(wasmBinary: ArrayBuffer, contextRate: number): Promise<void> {
    try {
      this.module = await createLibVgmModule({
        locateFile: (path: string) => path,
        noInitialRun: true,
        wasmBinary: new Uint8Array(wasmBinary),
      });
      if (this.module._vgm_web_validate_registry() !== 1) {
        throw new Error('The libvgm sound-core registry is incomplete.');
      }
      this.handle = this.module._vgm_web_create(contextRate, MAX_RENDER_FRAMES);
      this.outputPointer = this.module._malloc(MAX_RENDER_FRAMES * 2 * Float32Array.BYTES_PER_ELEMENT);
      if (this.handle === 0 || this.outputPointer === 0) {
        throw new Error('Unable to allocate the libvgm audio engine.');
      }
      this.refreshOutputView();
      this.post({
        type: 'engine-ready',
        devices: this.module._vgm_web_get_registered_device_count(),
        cores: this.module._vgm_web_get_registered_core_count(),
      });
    } catch (error) {
      this.post({
        type: 'error',
        code: -1,
        message: error instanceof Error ? error.message : 'Unable to initialize WebAssembly.',
      });
    }
  }

  private load(filename: string, data: ArrayBuffer): void {
    if (this.module === null || this.handle === 0) {
      this.post({ type: 'error', code: -1, message: 'The WebAssembly engine is not ready.' });
      return;
    }
    const bytes = new Uint8Array(data);
    const pointer = this.module._vgm_web_alloc_file(bytes.byteLength);
    if (pointer === 0) {
      this.post({ type: 'error', code: 2, message: 'Not enough WebAssembly memory for this file.' });
      return;
    }
    this.module.HEAPU8.set(bytes, pointer);
    const result = this.module._vgm_web_load(this.handle, pointer, bytes.byteLength);
    this.refreshOutputView();
    if (result !== 0) {
      const response: Extract<WorkletResponse, { type: 'error' }> = {
        type: 'error',
        code: result,
        message: this.string(this.module._vgm_web_get_error(this.handle)) || 'libvgm rejected the file.',
      };
      if (result === MISSING_RESOURCE) {
        response.chip = this.string(this.module._vgm_web_get_missing_chip(this.handle));
        response.resource = this.string(this.module._vgm_web_get_missing_resource(this.handle));
      }
      this.post(response);
      return;
    }

    const metadataKeys: (keyof Metadata)[] = [
      'title', 'titleJapanese', 'game', 'gameJapanese', 'system', 'systemJapanese',
      'artist', 'artistJapanese', 'date', 'encoder', 'comment',
    ];
    const metadata = {} as Metadata;
    metadataKeys.forEach((key, index) => {
      metadata[key] = this.string(this.module!._vgm_web_get_metadata(this.handle, index));
    });
    const chips: SoundChip[] = [];
    const chipCount = this.module._vgm_web_get_chip_count(this.handle);
    for (let index = 0; index < chipCount; index += 1) {
      chips.push({
        name: this.string(this.module._vgm_web_get_chip_name(this.handle, index)),
        core: this.string(this.module._vgm_web_get_chip_core(this.handle, index)).trim(),
        clock: this.module._vgm_web_get_chip_clock(this.handle, index),
      });
    }
    const track: LoadedTrack = {
      filename,
      duration: this.module._vgm_web_get_duration(this.handle),
      metadata,
      chips,
    };
    this.playing = false;
    this.paused = true;
    this.finished = false;
    this.post({ type: 'loaded', track });
  }

  private sendStatus(): void {
    if (this.module === null || this.handle === 0) {
      return;
    }
    this.finished = this.module._vgm_web_is_finished(this.handle) !== 0;
    if (this.finished) {
      this.playing = false;
      this.paused = false;
    }
    this.post({
      type: 'state',
      playing: this.playing,
      paused: this.paused,
      finished: this.finished,
      position: this.module._vgm_web_get_position(this.handle),
      duration: this.module._vgm_web_get_duration(this.handle),
      energy: this.energy,
    });
  }

  private async handleMessage(message: WorkletRequest): Promise<void> {
    if (message.type === 'init') {
      await this.initialize(message.wasmBinary, message.sampleRate);
      return;
    }
    if (message.type === 'dispose') {
      if (this.module !== null) {
        if (this.outputPointer !== 0) {
          this.module._free(this.outputPointer);
        }
        if (this.handle !== 0) {
          this.module._vgm_web_destroy(this.handle);
        }
      }
      this.module = null;
      this.handle = 0;
      this.outputPointer = 0;
      this.outputView = null;
      this.post({ type: 'disposed' });
      return;
    }
    if (message.type === 'load') {
      this.load(message.filename, message.data);
      return;
    }
    if (this.module === null || this.handle === 0) {
      return;
    }
    switch (message.type) {
      case 'play':
        if (this.module._vgm_web_start(this.handle) === 0) {
          this.playing = true;
          this.paused = false;
          this.finished = false;
        }
        break;
      case 'pause':
        this.module._vgm_web_pause(this.handle);
        this.playing = false;
        this.paused = true;
        break;
      case 'stop':
        this.module._vgm_web_stop(this.handle);
        this.playing = false;
        this.paused = true;
        this.finished = false;
        break;
      case 'seek':
        this.module._vgm_web_seek(this.handle, message.seconds);
        this.finished = false;
        break;
      case 'volume':
        this.targetGain = Math.max(0, Math.min(1, message.value));
        break;
      case 'mute':
        this.muted = message.value;
        break;
      case 'status':
        this.sendStatus();
        break;
      default:
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (output === undefined || output.length < 2) {
      return true;
    }
    const left = output[0];
    const right = output[1];
    if (this.module === null || this.handle === 0 || this.outputView === null || !this.playing || this.paused) {
      left.fill(0);
      right.fill(0);
      this.energy *= 0.9;
      return true;
    }

    const frames = Math.min(left.length, MAX_RENDER_FRAMES);
    this.module._vgm_web_render(this.handle, this.outputPointer, frames);
    const desiredGain = this.muted ? 0 : this.targetGain;
    const gainStep = (desiredGain - this.currentGain) / frames;
    let sum = 0;
    for (let index = 0; index < frames; index += 1) {
      this.currentGain += gainStep;
      const leftValue = this.outputView[index * 2] * this.currentGain;
      const rightValue = this.outputView[index * 2 + 1] * this.currentGain;
      left[index] = leftValue;
      right[index] = rightValue;
      sum += leftValue * leftValue + rightValue * rightValue;
    }
    this.currentGain = desiredGain;
    this.energy = Math.min(1, Math.sqrt(sum / (frames * 2)) * 3.5);
    return true;
  }
}

registerProcessor('libvgm-processor', LibVgmProcessor);
