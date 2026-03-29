import type { RtcState, TransferStats, FileMeta } from "../types";
import { StatusBadge } from "./StatusBadge";
import { TransferProgress } from "./TransferProgress";
import { formatBytes } from "../lib/constants";

interface ReceiverPanelProps {
  roomCode: string;
  peerPresent: boolean;
  rtcState: RtcState;
  incomingMeta: FileMeta | null;
  stats: TransferStats;
  downloadUrl: string | null;
  error: string | null;
}

export function ReceiverPanel({
  roomCode,
  peerPresent,
  rtcState,
  incomingMeta,
  stats,
  downloadUrl,
  error,
}: ReceiverPanelProps) {
  return (
    <div className="space-y-6">
      {/* Room info */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-3">
        <div className="text-xs uppercase tracking-widest text-neutral-500 font-medium">Joined Room</div>
        <div className="text-4xl font-mono font-bold tracking-[0.3em] text-center">
          {roomCode}
        </div>
      </div>

      {/* Connection status */}
      <div className="flex items-center justify-between">
        <StatusBadge state={rtcState} />
        <span className="text-xs text-neutral-500">
          {peerPresent ? "Sender connected" : "Waiting for sender…"}
        </span>
      </div>

      {/* Incoming file info */}
      {incomingMeta && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="text-xs uppercase tracking-widest text-neutral-500 font-medium mb-2">
            Incoming File
          </div>
          <div className="text-sm font-medium text-white truncate">{incomingMeta.fileName}</div>
          <div className="text-xs text-neutral-500 mt-0.5">{formatBytes(incomingMeta.fileSize)}</div>
        </div>
      )}

      {/* Transfer progress */}
      {stats.totalBytes > 0 && <TransferProgress stats={stats} />}

      {/* Download */}
      {stats.completed && downloadUrl && incomingMeta && (
        <div className="space-y-3">
          <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-2xl p-4 text-center">
            <div className="text-emerald-400 text-sm font-medium">✓ Transfer complete</div>
          </div>
          <a
            id="download-btn"
            href={downloadUrl}
            download={incomingMeta.fileName}
            className="block w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition-colors text-sm text-center"
          >
            Download {incomingMeta.fileName}
          </a>
        </div>
      )}

      {/* Waiting state */}
      {!incomingMeta && peerPresent && rtcState !== "failed" && rtcState !== "disconnected" && (
        <div className="text-center text-neutral-500 text-sm py-4">
          Waiting for sender to select and send a file…
        </div>
      )}

      {!peerPresent && (
        <div className="text-center text-neutral-500 text-sm py-4">
          <div className="inline-block w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin mr-2 align-middle" />
          Waiting for sender to connect…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-2xl p-4 text-center">
          <div className="text-red-400 text-sm">{error}</div>
        </div>
      )}
    </div>
  );
}
