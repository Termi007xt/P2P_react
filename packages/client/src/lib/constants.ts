export const CHUNK_SIZE = 64 * 1024; // 64 KB
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 512 * 1024; // 512 KB
export const SPEED_UPDATE_INTERVAL = 300; // ms

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
