export type PlayerState =
  | 'loading-wasm'
  | 'empty'
  | 'dragging'
  | 'loading-file'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'seeking'
  | 'finished'
  | 'unsupported-format'
  | 'invalid-file'
  | 'missing-resource'
  | 'audio-blocked'
  | 'browser-unsupported'
  | 'fatal-error';

export interface Metadata {
  title: string;
  titleJapanese: string;
  game: string;
  gameJapanese: string;
  system: string;
  systemJapanese: string;
  artist: string;
  artistJapanese: string;
  date: string;
  encoder: string;
  comment: string;
}

export interface SoundChip {
  name: string;
  core: string;
  clock: number;
}

export interface LoadedTrack {
  filename: string;
  duration: number;
  metadata: Metadata;
  chips: SoundChip[];
}

export type WorkletRequest =
  | { type: 'init'; wasmBinary: ArrayBuffer; sampleRate: number }
  | { type: 'load'; filename: string; data: ArrayBuffer }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'seek'; seconds: number }
  | { type: 'volume'; value: number }
  | { type: 'mute'; value: boolean }
  | { type: 'status' }
  | { type: 'dispose' };

export type WorkletResponse =
  | { type: 'engine-ready'; devices: number; cores: number }
  | { type: 'loaded'; track: LoadedTrack }
  | { type: 'state'; playing: boolean; paused: boolean; finished: boolean; position: number; duration: number; energy: number }
  | { type: 'error'; code: number; message: string; chip?: string; resource?: string }
  | { type: 'disposed' };
