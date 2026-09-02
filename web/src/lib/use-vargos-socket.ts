"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WsEvent } from "./types";

export interface VargosSocket {
  connected: boolean;
  lastEvent: WsEvent | null;
  /** Bump counter — callers use this to know when to refetch the API. */
  version: number;
}

/**
 * Connect to the vargos web WebSocket server (default ws://<host>:9004) with
 * exponential-backoff reconnect. Every server event bumps `version` so pages can
 * refetch their API data on live changes.
 */
export function useVargosSocket(
  onEvent?: (e: WsEvent) => void,
): VargosSocket {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [version, setVersion] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const port = process.env.NEXT_PUBLIC_VARGOS_WS_PORT || "9004";
      const ws = new WebSocket(`${proto}://${window.location.hostname}:${port}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (msg) => {
        try {
          const e = JSON.parse(msg.data as string) as WsEvent;
          setLastEvent(e);
          setVersion((v) => v + 1);
          onEventRef.current?.(e);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { connected, lastEvent, version };
}

/**
 * Subscribe to the vargos WebSocket and refetch via `refresh`, debounced so a burst
 * of `fs_change` events (e.g. an active session appending JSONL on every tool call)
 * collapses into one refresh instead of N.
 */
const REFRESH_DEBOUNCE_MS = 1500;

export function useLiveRefresh(refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useVargosSocket(useCallback((e: WsEvent) => {
    if (e.type !== "fs_change" && e.type !== "gateway_status") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      refreshRef.current();
    }, REFRESH_DEBOUNCE_MS);
  }, []));

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
}
