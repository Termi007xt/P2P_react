import { useRef } from "react";
import type { RtcState, TransferStats } from "../types";
import { StatusBadge } from "./StatusBadge";
import { TransferProgress } from "./TransferProgress";
import { formatBytes } from "../lib/constants";

interface SenderPanelProps {
  roomCode: string;
  shareLink: string;
  peerPresent: boolean;
  rtcState: RtcState;
  selectedFile: File | null;
  stats: TransferStats;
  error: string | null;
  onSelectFile: (file: File) => void;
  onStartTransfer: () => void;
}

export function SenderPanel({
  roomCode,
  shareLink,
  peerPresent,
  rtcState,
  selectedFile,
  stats,
  error,
  onSelectFile,
  onStartTransfer,
}: SenderPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copied = useRef(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    copied.current = true;
    // Force a brief visual feedback via the button text
    const btn = document.getElementById("copy-link-btn");
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy Link";
      }, 1500);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      alert("Only .zip files are allowed.");
      e.target.value = "";
      return;
    }
    onSelectFile(file);
  };

  const canSend =
    peerPresent &&
    selectedFile &&
    (rtcState === "connected" || rtcState === "idle" || rtcState === "waiting") &&
    !stats.completed &&
    stats.bytesTransferred === 0;

  return (
    <div className="space-y-6">
      {/* Room code display */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
        <div className="text-xs uppercase tracking-widest text-neutral-500 font-medium">Room Code</div>
        <div className="text-4xl font-mono font-bold tracking-[0.3em] text-center select-all">
          {roomCode}
        </div>
      </div>

      {/* Share link */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
        <div className="text-xs uppercase tracking-widest text-neutral-500 font-medium">Share Link</div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={shareLink}
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-neutral-300 truncate outline-none"
          />
          <button
            id="copy-link-btn"
            onClick={() => handleCopy(shareLink)}
            className="px-4 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-neutral-200 transition-colors shrink-0"
          >
            Copy Link
          </button>
        </div>
      </div>

      {/* Connection status */}
      <div className="flex items-center justify-between">
        <StatusBadge state={rtcState} />
        <span className="text-xs text-neutral-500">
          {peerPresent ? "Receiver connected" : "Waiting for receiver…"}
        </span>
      </div>

      {/* File selection */}
      {peerPresent && (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            className="hidden"
            id="file-input"
          />

          {!selectedFile ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 border-2 border-dashed border-neutral-700 rounded-2xl text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 transition-colors text-sm"
            >
              Click to select a .zip file
            </button>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white truncate max-w-[240px]">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {formatBytes(selectedFile.size)}
                </div>
              </div>
              {!stats.completed && stats.bytesTransferred === 0 && (
                <button
                  onClick={() => {
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    onSelectFile(null as unknown as File);
                  }}
                  className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Change
                </button>
              )}
            </div>
          )}

          {/* Send button */}
          {selectedFile && canSend && (
            <button
              id="send-btn"
              onClick={onStartTransfer}
              className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition-colors text-sm"
            >
              Send File
            </button>
          )}
        </div>
      )}

      {/* Transfer progress */}
      {stats.totalBytes > 0 && <TransferProgress stats={stats} />}

      {/* Completion */}
      {stats.completed && (
        <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-2xl p-4 text-center">
          <div className="text-emerald-400 text-sm font-medium">✓ Transfer complete</div>
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
