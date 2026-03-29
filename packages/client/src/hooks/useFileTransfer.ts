import { useCallback, useRef, useState } from "react";
import type { FileMeta, TransferStats } from "../types";
import {
  CHUNK_SIZE,
  DISK_READ_SIZE,
  HIGH_WATER_MARK,
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  SPEED_UPDATE_INTERVAL,
} from "../lib/constants";

const INITIAL_STATS: TransferStats = {
  progress: 0,
  bytesTransferred: 0,
  totalBytes: 0,
  speed: 0,
  completed: false,
};

export function useFileTransfer() {
  const [stats, setStats] = useState<TransferStats>(INITIAL_STATS);
  const [incomingMeta, setIncomingMeta] = useState<FileMeta | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Receiver state
  const chunksRef = useRef<Uint8Array[]>([]);
  const receivedBytesRef = useRef(0);

  // Speed tracking
  const startTimeRef = useRef(0);
  const lastSpeedUpdateRef = useRef(0);
  const lastBytesRef = useRef(0);

  // Abort handle
  const abortRef = useRef(false);

  const resetStats = useCallback(() => {
    setStats(INITIAL_STATS);
    setIncomingMeta(null);
    setDownloadUrl(null);
    setError(null);
    chunksRef.current = [];
    receivedBytesRef.current = 0;
    startTimeRef.current = 0;
    lastSpeedUpdateRef.current = 0;
    lastBytesRef.current = 0;
    abortRef.current = false;
  }, []);

  // ── SENDER ──

  const sendFile = useCallback((file: File, dc: RTCDataChannel) => {
    if (!file.name.endsWith(".zip")) {
      setError("Only .zip files are allowed.");
      return;
    }

    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

    // Send metadata
    const meta: FileMeta = {
      type: "file-meta",
      fileName: file.name,
      fileSize: totalBytes,
      mimeType: "application/zip",
      chunkSize: CHUNK_SIZE,
      totalChunks,
    };
    dc.send(JSON.stringify(meta));

    setStats({
      progress: 0,
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      completed: false,
    });

    abortRef.current = false;
    startTimeRef.current = performance.now();
    lastSpeedUpdateRef.current = performance.now();
    lastBytesRef.current = 0;

    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    let fileOffset = 0;

    /** Wait for the data channel buffer to drain below threshold */
    const waitForDrain = (): Promise<void> => {
      return new Promise((resolve) => {
        if (dc.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
          resolve();
          return;
        }
        const onLow = () => {
          dc.removeEventListener("bufferedamountlow", onLow);
          resolve();
        };
        dc.addEventListener("bufferedamountlow", onLow);
      });
    };

    const updateStats = (bytesSent: number) => {
      const now = performance.now();
      if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
        const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
        const bytesDelta = bytesSent - lastBytesRef.current;
        const speed = elapsed > 0 ? bytesDelta / elapsed : 0;
        lastSpeedUpdateRef.current = now;
        lastBytesRef.current = bytesSent;

        setStats({
          progress: Math.round((bytesSent / totalBytes) * 100),
          bytesTransferred: bytesSent,
          totalBytes,
          speed,
          completed: false,
        });
      }
    };

    /**
     * High-throughput send loop:
     * 1. Read a large block from disk (DISK_READ_SIZE, e.g. 16MB) — one async I/O
     * 2. Split into CHUNK_SIZE pieces in memory (sync, fast)
     * 3. Burst-send chunks to the data channel until HIGH_WATER_MARK
     * 4. When buffer is full, wait for drain, then continue bursting
     * 5. When the block is exhausted, read the next block from disk
     */
    const sendLoop = async () => {
      try {
        while (fileOffset < totalBytes) {
          if (abortRef.current || dc.readyState !== "open") return;

          // 1. Read a large block from disk
          const blockStart = fileOffset;
          const blockEnd = Math.min(fileOffset + DISK_READ_SIZE, totalBytes);
          const blockBuf = await file.slice(blockStart, blockEnd).arrayBuffer();
          const blockLen = blockBuf.byteLength;

          // 2. Burst-send CHUNK_SIZE pieces from this block
          let blockOffset = 0;
          while (blockOffset < blockLen) {
            if (abortRef.current || dc.readyState !== "open") return;

            // Wait for buffer space if needed
            if (dc.bufferedAmount > HIGH_WATER_MARK) {
              await waitForDrain();
            }

            const chunkEnd = Math.min(blockOffset + CHUNK_SIZE, blockLen);
            const chunk = blockBuf.slice(blockOffset, chunkEnd);
            dc.send(chunk);

            blockOffset = chunkEnd;
            updateStats(blockStart + blockOffset);
          }

          // Advance file offset past this block
          fileOffset = blockEnd;
        }

        // All data sent — wait for final drain
        await waitForDrain();

        if (dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "file-complete" }));
        }

        const totalTime = (performance.now() - startTimeRef.current) / 1000;
        setStats({
          progress: 100,
          bytesTransferred: totalBytes,
          totalBytes,
          speed: totalTime > 0 ? totalBytes / totalTime : 0,
          completed: true,
        });
      } catch (err) {
        console.error("Send error:", err);
        setError(`Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    sendLoop();
  }, []);

  // ── RECEIVER ──

  const setupReceiver = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    let expectedBytes = 0;

    dc.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "file-meta") {
            const meta = msg as FileMeta;
            setIncomingMeta(meta);
            expectedBytes = meta.fileSize;
            chunksRef.current = [];
            receivedBytesRef.current = 0;
            startTimeRef.current = performance.now();
            lastSpeedUpdateRef.current = performance.now();
            lastBytesRef.current = 0;

            setStats({
              progress: 0,
              bytesTransferred: 0,
              totalBytes: meta.fileSize,
              speed: 0,
              completed: false,
            });
            setDownloadUrl(null);
            setError(null);
            return;
          }

          if (msg.type === "file-complete") {
            const blob = new Blob(chunksRef.current as unknown as BlobPart[], { type: "application/zip" });
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);

            const totalTime = (performance.now() - startTimeRef.current) / 1000;
            const finalBytes = receivedBytesRef.current;
            setStats({
              progress: 100,
              bytesTransferred: finalBytes,
              totalBytes: expectedBytes,
              speed: totalTime > 0 ? finalBytes / totalTime : 0,
              completed: true,
            });

            // Free chunk references (Blob now owns the data)
            chunksRef.current = [];
            return;
          }
        } catch {
          // Not JSON, ignore
        }
      } else {
        // Binary chunk
        const chunk = new Uint8Array(e.data as ArrayBuffer);
        chunksRef.current.push(chunk);
        receivedBytesRef.current += chunk.byteLength;

        const now = performance.now();
        if (now - lastSpeedUpdateRef.current >= SPEED_UPDATE_INTERVAL) {
          const elapsed = (now - lastSpeedUpdateRef.current) / 1000;
          const bytesDelta = receivedBytesRef.current - lastBytesRef.current;
          const speed = elapsed > 0 ? bytesDelta / elapsed : 0;
          lastSpeedUpdateRef.current = now;
          lastBytesRef.current = receivedBytesRef.current;

          setStats((prev: TransferStats) => ({
            ...prev,
            progress: Math.round((receivedBytesRef.current / (expectedBytes || 1)) * 100),
            bytesTransferred: receivedBytesRef.current,
            speed,
          }));
        }
      }
    };
  }, []);

  return {
    stats,
    incomingMeta,
    downloadUrl,
    error,
    setError,
    sendFile,
    setupReceiver,
    resetStats,
  };
}
