export const CHUNK_SIZE = 256 * 1024; // 256 KB — size of each WebRTC send
export const DISK_READ_SIZE = 16 * 1024 * 1024; // 16 MB — read large blocks from disk at once
export const HIGH_WATER_MARK = 8 * 1024 * 1024; // 8 MB — stop sending when buffer exceeds this
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 2 * 1024 * 1024; // 2 MB — resume sending when buffer drains to this
export const SPEED_UPDATE_INTERVAL = 300; // ms
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB — max file size for transfer

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

/** Build WebSocket URL based on current environment */
export function getWsUrl(): string {
  const loc = window.location;
  // In dev (Vite proxy), use current host. In production, use same origin.
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${loc.host}/ws`;
}

/** Build a shareable link for a room */
export function getShareLink(roomCode: string): string {
  const loc = window.location;
  return `${loc.origin}?room=${roomCode}&role=receiver`;
}

/** Format bytes to human-readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format speed (bytes/s) to human-readable */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "0 B/s";
  return `${formatBytes(bytesPerSec)}/s`;
}
