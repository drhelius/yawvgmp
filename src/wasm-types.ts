export interface LibVgmModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  UTF8ToString(pointer: number): string;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _vgm_web_create(sampleRate: number, maxFrames: number): number;
  _vgm_web_destroy(handle: number): void;
  _vgm_web_alloc_file(size: number): number;
  _vgm_web_discard_file(pointer: number): void;
  _vgm_web_load(handle: number, pointer: number, size: number): number;
  _vgm_web_unload(handle: number): void;
  _vgm_web_start(handle: number): number;
  _vgm_web_pause(handle: number): number;
  _vgm_web_stop(handle: number): number;
  _vgm_web_seek(handle: number, seconds: number): number;
  _vgm_web_get_position(handle: number): number;
  _vgm_web_get_duration(handle: number): number;
  _vgm_web_is_finished(handle: number): number;
  _vgm_web_set_volume(handle: number, volume: number): number;
  _vgm_web_set_mute(handle: number, muted: number): number;
  _vgm_web_render(handle: number, output: number, frames: number): number;
  _vgm_web_get_metadata(handle: number, field: number): number;
  _vgm_web_get_chip_count(handle: number): number;
  _vgm_web_get_chip_name(handle: number, index: number): number;
  _vgm_web_get_chip_core(handle: number, index: number): number;
  _vgm_web_get_chip_clock(handle: number, index: number): number;
  _vgm_web_get_error(handle: number): number;
  _vgm_web_get_missing_chip(handle: number): number;
  _vgm_web_get_missing_resource(handle: number): number;
  _vgm_web_get_registered_device_count(): number;
  _vgm_web_get_registered_core_count(): number;
  _vgm_web_validate_registry(): number;
}

export type ModuleFactory = (options: {
  locateFile(path: string): string;
  noInitialRun: boolean;
  wasmBinary: Uint8Array;
}) => Promise<LibVgmModule>;
