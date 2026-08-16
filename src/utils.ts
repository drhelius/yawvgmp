export const acceptedExtensions = ['.vgm', '.vgz'] as const;

export function hasSupportedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return acceptedExtensions.some((extension) => lower.endsWith(extension));
}

export function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatClock(clock: number): string {
  if (clock >= 1_000_000) {
    return `${(clock / 1_000_000).toFixed(clock % 1_000_000 === 0 ? 0 : 3)} MHz`;
  }
  if (clock >= 1_000) {
    return `${(clock / 1_000).toFixed(clock % 1_000 === 0 ? 0 : 2)} kHz`;
  }
  return clock > 0 ? `${clock} Hz` : 'clock n/a';
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
