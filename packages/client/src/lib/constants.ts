export const CHUNK_SIZE = 256 * 1024; // 256 KB per WebRTC message (including 8-byte offset header)
export const OFFSET_SIZE = 8; // bytes for file-offset header in each chunk
export const DATA_PER_CHUNK = CHUNK_SIZE - OFFSET_SIZE; // actual data bytes per chunk
export const DISK_READ_SIZE = 16 * 1024 * 1024; // 16 MB disk reads
export const HIGH_WATER_MARK = 8 * 1024 * 1024; // per-channel buffer cap
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 2 * 1024 * 1024; // resume threshold
export const SPEED_UPDATE_INTERVAL = 300; // ms

// Multi-connection
export const MAX_CHANNELS = 12; // 1 primary + up to 11 boost
export const BOOST_BATCH = 3; // channels added per scaling step
export const BOOST_TIMEOUT = 10_000; // ms to wait for a boost connection
export const SPEED_CHECK_INTERVAL = 3_000; // ms between adaptive checks
export const SPEED_TARGET = 30 * 1024 * 1024; // add more channels if below 30 MB/s

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
