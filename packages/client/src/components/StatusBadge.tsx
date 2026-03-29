import type { RtcState } from "../types";

const STATE_CONFIG: Record<RtcState, { label: string; color: string }> = {
  idle: { label: "Idle", color: "bg-neutral-700 text-neutral-300" },
  waiting: { label: "Waiting", color: "bg-yellow-900/60 text-yellow-300" },
  connecting: { label: "Connecting", color: "bg-blue-900/60 text-blue-300" },
  connected: { label: "Connected", color: "bg-green-900/60 text-green-300" },
  failed: { label: "Failed", color: "bg-red-900/60 text-red-300" },
  disconnected: { label: "Disconnected", color: "bg-red-900/60 text-red-300" },
  completed: { label: "Completed", color: "bg-emerald-900/60 text-emerald-300" },
};

export function StatusBadge({ state }: { state: RtcState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          state === "connecting" ? "bg-blue-400 animate-pulse" :
          state === "connected" ? "bg-green-400" :
          state === "failed" || state === "disconnected" ? "bg-red-400" :
          state === "completed" ? "bg-emerald-400" :
          state === "waiting" ? "bg-yellow-400 animate-pulse" :
          "bg-neutral-400"
        }`}
      />
      {cfg.label}
    </span>
  );
}
