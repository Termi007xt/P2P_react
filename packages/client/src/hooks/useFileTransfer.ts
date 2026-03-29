import { useCallback, useRef, useState } from "react";
import type { FileMeta, TransferStats } from "../types";
import { CHUNK_SIZE, BUFFERED_AMOUNT_LOW_THRESHOLD, SPEED_UPDATE_INTERVAL } from "../lib/constants";

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

  // Abort handle for sender
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

    // Send metadata as JSON string
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

    let offset = 0;

    /** Wait for the data channel buffer to drain */
    const waitForBufferDrain = (): Promise<void> => {
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

    /** Read a file slice as ArrayBuffer (synchronous-like with await) */
    const readSlice = (start: number, end: number): Promise<ArrayBuffer> => {
      return file.slice(start, end).arrayBuffer();
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

    /** Main send loop — truly sequential: read, wait for buffer, send */
    const sendLoop = async () => {
      try {
        while (offset < totalBytes) {
          if (abortRef.current || dc.readyState !== "open") return;

          // Wait for buffer space before reading & sending
          await waitForBufferDrain();

          const end = Math.min(offset + CHUNK_SIZE, totalBytes);
          const buf = await readSlice(offset, end);

          if (dc.readyState !== "open") return;
          dc.send(buf);

          offset = end;
          updateStats(offset);
        }

        // All data sent — wait for final drain then send completion signal
        await waitForBufferDrain();

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

  /** Set up data channel handlers for receiving */
  const setupReceiver = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";

    // Track total expected bytes for this receiver instance
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
            // Assemble blob
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
