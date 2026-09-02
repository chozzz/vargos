"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

type Phase = "idle" | "connecting" | "qr" | "connected" | "saved" | "expired" | "error";
interface PairStatus {
  phase: Phase;
  qr?: string;
  name?: string;
  error?: string;
}

export function WhatsAppPairDialog({
  open,
  onOpenChange,
  channelId,
  onPaired,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channelId: string;
  onPaired: () => void;
}) {
  const [status, setStatus] = useState<PairStatus>({ phase: "connecting" });
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const begin = useCallback(
    async (reset = false) => {
      doneRef.current = false;
      setStartErr(null);
      setQrImg(null);
      setStatus({ phase: "connecting" });
      const res = await api.rpc("channel.pairStart", { id: channelId, reset });
      if (!res.ok) {
        setStartErr(res.error ?? "could not start pairing");
        setStatus({ phase: "error", error: res.error });
        return;
      }
      stopPoll();
      pollRef.current = setInterval(async () => {
        const s = await api.rpc("channel.pairStatus", { id: channelId });
        if (!s.ok) return;
        const st = (s.result ?? { phase: "idle" }) as PairStatus;
        setStatus(st);
        if (st.phase === "saved" && !doneRef.current) {
          doneRef.current = true;
          stopPoll();
          setTimeout(() => {
            onOpenChange(false);
            onPaired();
          }, 1600);
        }
        if (st.phase === "error" || st.phase === "expired") stopPoll();
      }, 1200);
    },
    [channelId, onOpenChange, onPaired],
  );

  // Start when opened; cancel + cleanup when closed.
  useEffect(() => {
    if (!open) return;
    void begin(false);
    return () => {
      stopPoll();
      if (!doneRef.current) void api.rpc("channel.pairCancel", { id: channelId });
    };
  }, [open, begin, channelId]);

  // Render the QR string to an image whenever it changes.
  useEffect(() => {
    if (status.phase !== "qr" || !status.qr) return;
    let alive = true;
    QRCode.toDataURL(status.qr, { margin: 1, width: 260 })
      .then((url) => alive && setQrImg(url))
      .catch(() => alive && setQrImg(null));
    return () => {
      alive = false;
    };
  }, [status.phase, status.qr]);

  const phase = startErr ? "error" : status.phase;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Pair WhatsApp · ${channelId}`}
        description="Open WhatsApp on your phone → Settings → Linked Devices → Link a device."
        className="max-w-md"
      >
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          {(phase === "connecting" || phase === "idle") && (
            <>
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Starting a pairing session…</p>
            </>
          )}

          {phase === "qr" && (
            <>
              {qrImg ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URI QR; next/image can't optimise it
                <img
                  src={qrImg}
                  alt="WhatsApp pairing QR"
                  width={240}
                  height={240}
                  className="rounded-lg bg-white p-2"
                />
              ) : (
                <div className="flex size-[240px] items-center justify-center rounded-lg bg-muted">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Scan with your phone. The code refreshes automatically.
              </p>
            </>
          )}

          {phase === "connected" && (
            <>
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm">
                Linked{status.name ? ` as ${status.name}` : ""} — saving credentials…
              </p>
            </>
          )}

          {phase === "saved" && (
            <>
              <CheckCircle2 className="size-7 text-success" />
              <p className="text-sm font-medium">Paired. Bringing the channel online…</p>
            </>
          )}

          {phase === "expired" && (
            <>
              <TriangleAlert className="size-6 text-warning" />
              <p className="text-sm">The QR expired before it was scanned.</p>
            </>
          )}

          {phase === "error" && (
            <>
              <TriangleAlert className="size-6 text-destructive" />
              <p className="text-sm text-destructive">
                {startErr ?? status.error ?? "Pairing failed."}
              </p>
              <p className="text-xs text-muted-foreground">
                Try again — use “Clear &amp; retry” if the channel was paired before.
              </p>
            </>
          )}
        </div>

        {(phase === "expired" || phase === "error") && (
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="outline" size="sm" onClick={() => void begin(true)}>
              <RefreshCw className="size-3.5" />
              Clear &amp; retry
            </Button>
            <Button size="sm" onClick={() => void begin(false)}>
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
