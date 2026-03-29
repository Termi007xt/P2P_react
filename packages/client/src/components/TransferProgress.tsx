import type { TransferStats } from "../types";
import { formatBytes, formatSpeed } from "../lib/constants";

export function TransferProgress({ stats }: { stats: TransferStats }) {
  if (stats.totalBytes === 0) return null;

  return (
    <div className="w-full space-y-3">
      {/* Progress bar */}
      <div className="w-full h-3 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            stats.completed
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
              : "bg-gradient-to-r from-white to-neutral-300"
          }`}
          style={{ width: `${stats.progress}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
        <span>{stats.progress}%</span>
        <span>
          {formatBytes(stats.bytesTransferred)} / {formatBytes(stats.totalBytes)}
        </span>
        <span>{stats.completed ? "Done" : formatSpeed(stats.speed)}</span>
      </div>
    </div>
  );
}
