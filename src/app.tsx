import {
  FileAudio, FolderOpen, Pause, Play, RotateCcw, Square, Volume2, VolumeX, X,
} from 'lucide-preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { AudioEngine } from './audio-engine';
import { SignalBackground } from './background';
import type { LoadedTrack, PlayerState, WorkletResponse } from './types';
import { clamp, formatClock, formatTime, hasSupportedExtension } from './utils';
import './style.css';

const ERROR_STATES: PlayerState[] = [
  'unsupported-format', 'invalid-file', 'missing-resource', 'audio-blocked',
  'browser-unsupported', 'fatal-error',
];

function statusLabel(state: PlayerState): string {
  const labels: Record<PlayerState, string> = {
    'loading-wasm': 'INITIALIZING LIBVGM',
    empty: 'NO FILE LOADED',
    dragging: 'DROP VGM OR VGZ',
    'loading-file': 'DECODING TRACK',
    ready: 'READY',
    playing: 'PLAYING',
    paused: 'PAUSED',
    seeking: 'SEEKING',
    finished: 'FINISHED',
    'unsupported-format': 'UNSUPPORTED FORMAT',
    'invalid-file': 'INVALID FILE',
    'missing-resource': 'EXTERNAL DATA REQUIRED',
    'audio-blocked': 'AUDIO CONTEXT BLOCKED',
    'browser-unsupported': 'BROWSER UNSUPPORTED',
    'fatal-error': 'PLAYBACK ERROR',
  };
  return labels[state];
}

export function App() {
  const engineRef = useRef<AudioEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<LoadedTrack | null>(null);
  const stateRef = useRef<PlayerState>('loading-wasm');
  const volumeRef = useRef(0.8);
  const mutedRef = useRef(false);
  const dragDepthRef = useRef(0);
  const stateBeforeDragRef = useRef<PlayerState>('empty');
  const [state, setState] = useState<PlayerState>('loading-wasm');
  const [track, setTrack] = useState<LoadedTrack | null>(null);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [engineStats, setEngineStats] = useState('');

  const handleEngineMessage = useCallback((message: WorkletResponse) => {
    switch (message.type) {
      case 'engine-ready':
        setEngineStats(`${message.devices} DEVICES / ${message.cores} CORES`);
        setState('empty');
        break;
      case 'loaded':
        setTrack(message.track);
        setPosition(0);
        setError('');
        setErrorDetail('');
        setState('ready');
        engineRef.current?.send({ type: 'volume', value: volumeRef.current });
        engineRef.current?.send({ type: 'mute', value: mutedRef.current });
        break;
      case 'state':
        setPosition(message.position);
        if (stateRef.current === 'loading-wasm' || stateRef.current === 'loading-file' ||
            stateRef.current === 'dragging' || ERROR_STATES.includes(stateRef.current)) {
          break;
        }
        if (message.finished) setState('finished');
        else if (message.playing) setState('playing');
        else if (message.paused && trackRef.current !== null) setState((current) => current === 'ready' ? current : 'paused');
        break;
      case 'error':
        setError(message.message);
        if (message.code === 9) {
          setState('missing-resource');
          setErrorDetail(`${message.chip || 'A sound chip'} needs ${message.resource || 'external data'}. This VGM is not self-contained.`);
        } else if (message.code === 5) {
          setState('unsupported-format');
        } else if (message.code === 6 || message.code === 4) {
          setState('invalid-file');
        } else {
          setState('fatal-error');
        }
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const engine = new AudioEngine();
    engineRef.current = engine;
    engine.initialize(handleEngineMessage).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unable to initialize browser audio.');
      setState('browser-unsupported');
    });
    return () => engine.dispose();
  }, [handleEngineMessage]);

  const play = useCallback(async () => {
    if (track === null || state === 'loading-file' || state === 'loading-wasm' || ERROR_STATES.includes(state)) return;
    try {
      const running = await engineRef.current?.resume();
      if (!running) {
        setError('Select play again to allow this page to start audio.');
        setState('audio-blocked');
        return;
      }
      engineRef.current?.send({ type: 'play' });
      setState('playing');
    } catch {
      setError('The browser did not allow the audio context to resume.');
      setState('audio-blocked');
    }
  }, [state, track]);

  const pause = useCallback(() => {
    engineRef.current?.send({ type: 'pause' });
    setState('paused');
  }, []);

  const togglePlay = useCallback(() => {
    if (state === 'playing') pause();
    else void play();
  }, [pause, play, state]);

  const loadFile = useCallback(async (file: File) => {
    if (!hasSupportedExtension(file.name)) {
      setError('Choose a file ending in .vgm or .vgz.');
      setErrorDetail('The selected file was not sent anywhere and was not opened.');
      setState('unsupported-format');
      return;
    }
    engineRef.current?.send({ type: 'pause' });
    setTrack(null);
    setPosition(0);
    setState('loading-file');
    setError('');
    setErrorDetail('');
    try {
      await engineRef.current?.resume();
      const data = await file.arrayBuffer();
      engineRef.current?.send({ type: 'load', filename: file.name, data }, [data]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to read the local file.');
      setState('invalid-file');
    }
  }, []);

  const openFile = useCallback(() => fileInputRef.current?.click(), []);

  const seek = useCallback((seconds: number) => {
    if (track === null) return;
    const next = clamp(seconds, 0, track.duration);
    setPosition(next);
    setState('seeking');
    engineRef.current?.send({ type: 'seek', seconds: next });
  }, [track]);

  const stop = useCallback(() => {
    engineRef.current?.send({ type: 'stop' });
    setPosition(0);
    setState('paused');
  }, []);

  const changeVolume = useCallback((next: number) => {
    const value = clamp(next, 0, 1);
    setVolume(value);
    if (value > 0 && muted) {
      setMuted(false);
      engineRef.current?.send({ type: 'mute', value: false });
    }
    engineRef.current?.send({ type: 'volume', value });
  }, [muted]);

  const toggleMute = useCallback(() => {
    const value = !muted;
    setMuted(value);
    engineRef.current?.send({ type: 'mute', value });
  }, [muted]);

  const dismissError = useCallback(() => {
    setError('');
    setErrorDetail('');
    setState(track === null ? 'empty' : 'paused');
  }, [track]);

  useEffect(() => {
    const validDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true;
    const enter = (event: DragEvent) => {
      if (!validDrag(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) stateBeforeDragRef.current = state;
      setState('dragging');
    };
    const over = (event: DragEvent) => {
      if (!validDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!validDrag(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setState(stateBeforeDragRef.current);
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      const file = event.dataTransfer?.files[0];
      if (file) void loadFile(file);
      else setState(stateBeforeDragRef.current);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [loadFile, state]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, button')) return;
      if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(position - 5);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(position + 5);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        changeVolume(volume + 0.05);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        changeVolume(volume - 0.05);
      } else if (event.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        openFile();
      } else if (event.key === 'Escape') {
        if (state === 'dragging') setState(stateBeforeDragRef.current);
        if (ERROR_STATES.includes(state)) dismissError();
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [changeVolume, dismissError, openFile, position, seek, state, toggleMute, togglePlay, volume]);

  const title = track?.filename || 'NO FILE LOADED';
  const subtitle = [track?.metadata.game || track?.metadata.gameJapanese, track?.metadata.system || track?.metadata.systemJapanese]
    .filter(Boolean).join(' // ');
  const loading = state === 'loading-wasm' || state === 'loading-file';
  const canControl = track !== null && !loading && !ERROR_STATES.includes(state);
  const errorVisible = ERROR_STATES.includes(state) && error.length > 0;

  return (
    <>
      <SignalBackground />
      <main class="page-shell">
        <section class="player" aria-labelledby="track-title">
          <header class="player-header">
            <div class="brand" aria-label="YAWVGMP, based on libvgm">
              <span class="brand-mark">YAWVGMP</span>
              <span>Based on libvgm</span>
            </div>
            <div class={`state state-${state}`} role="status" aria-live="polite">
              <span class="state-light" />
              {statusLabel(state)}
            </div>
          </header>

          <div class="track-heading">
            <div class="track-icon"><FileAudio size={25} aria-hidden="true" /></div>
            <div class="track-copy">
              <h1 id="track-title" title={title}>{title}</h1>
              {subtitle && <p title={subtitle}>{subtitle}</p>}
            </div>
            <button class="open-button" type="button" onClick={openFile} disabled={loading} title="Open VGM file">
              <FolderOpen size={18} aria-hidden="true" />
              <span>{track ? 'LOAD ANOTHER' : 'OPEN FILE'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vgm,.vgz,application/gzip"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void loadFile(file);
                event.currentTarget.value = '';
              }}
            />
          </div>

          <div class="timeline">
            <input
              class="seek"
              type="range"
              min="0"
              max={Math.max(track?.duration || 0, 0.001)}
              step="0.01"
              value={position}
              disabled={!canControl}
              aria-label="Track position"
              style={{ '--progress': `${track && track.duration > 0 ? position / track.duration * 100 : 0}%` }}
              onInput={(event) => seek(event.currentTarget.valueAsNumber)}
            />
            <div class="time-row">
              <time>{formatTime(position)}</time>
              <span>{track?.filename || 'VGM / VGZ'}</span>
              <time>{formatTime(track?.duration || 0)}</time>
            </div>
          </div>

          <div class="transport">
            <div class="transport-spacer" />
            <div class="transport-buttons">
              <button type="button" class="icon-button" onClick={stop} disabled={!canControl} aria-label="Stop" title="Stop">
                <Square size={18} fill="currentColor" aria-hidden="true" />
              </button>
              <button type="button" class="play-button" onClick={togglePlay} disabled={!canControl} aria-label={state === 'playing' ? 'Pause' : 'Play'} title={state === 'playing' ? 'Pause' : 'Play'}>
                {state === 'playing' ? <Pause size={28} fill="currentColor" aria-hidden="true" /> : <Play size={28} fill="currentColor" aria-hidden="true" />}
              </button>
              <button type="button" class="icon-button" onClick={() => seek(0)} disabled={!canControl} aria-label="Return to beginning" title="Return to beginning">
                <RotateCcw size={19} aria-hidden="true" />
              </button>
            </div>
            <div class="volume-control">
              <button type="button" class="volume-button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
                {muted || volume === 0 ? <VolumeX size={19} aria-hidden="true" /> : <Volume2 size={19} aria-hidden="true" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                aria-label="Volume"
                style={{ '--progress': `${volume * 100}%` }}
                onInput={(event) => changeVolume(event.currentTarget.valueAsNumber)}
              />
              <output>{Math.round(volume * 100).toString().padStart(3, '0')}</output>
            </div>
          </div>

          <div class="information">
            <section class="metadata" aria-labelledby="metadata-heading">
              <h2 id="metadata-heading">GD3 METADATA</h2>
              <dl>
                <div><dt>TRACK</dt><dd>{track?.metadata.title || '—'}</dd></div>
                <div><dt>GAME</dt><dd>{track?.metadata.game || '—'}</dd></div>
                <div><dt>SYSTEM</dt><dd>{track?.metadata.system || '—'}</dd></div>
                <div><dt>AUTHOR</dt><dd>{track?.metadata.artist || '—'}</dd></div>
                <div><dt>DATE</dt><dd>{track?.metadata.date || '—'}</dd></div>
                <div><dt>ENCODER</dt><dd>{track?.metadata.encoder || '—'}</dd></div>
              </dl>
              {track?.metadata.comment && <p class="comment">{track.metadata.comment}</p>}
            </section>
            <section class="chips" aria-labelledby="chips-heading">
              <div class="section-title-row">
                <h2 id="chips-heading">ACTIVE SOUND CHIPS</h2>
                <span>{track?.chips.length || 0}</span>
              </div>
              {track && track.chips.length > 0 ? (
                <ul>
                  {track.chips.map((chip, index) => (
                    <li key={`${chip.name}-${index}`}>
                      <span class="chip-index">{(index + 1).toString().padStart(2, '0')}</span>
                      <span class="chip-name">{chip.name}</span>
                      <span class="chip-core">{chip.core}</span>
                      <span class="chip-clock">{formatClock(chip.clock)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p class="empty-data">AWAITING VGM HEADER</p>}
            </section>
          </div>

          <footer class="player-footer">
            <span>LOCAL PROCESSING / NO UPLOADS</span>
            <span>{engineStats || 'WASM AUDIO ENGINE'}</span>
          </footer>
        </section>
      </main>

      {state === 'dragging' && (
        <div class="drag-overlay" role="status" aria-live="assertive">
          <div><FileAudio size={52} aria-hidden="true" /><strong>DROP SIGNAL FILE</strong><span>.VGM / .VGZ</span></div>
        </div>
      )}

      {errorVisible && (
        <div class="error-panel" role="alert">
          <button type="button" onClick={dismissError} aria-label="Dismiss error" title="Dismiss"><X size={18} /></button>
          <strong>{statusLabel(state)}</strong>
          <span>{error}</span>
          {errorDetail && <small>{errorDetail}</small>}
        </div>
      )}
    </>
  );
}
