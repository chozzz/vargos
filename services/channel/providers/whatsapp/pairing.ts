/**
 * Web-driven WhatsApp pairing. Unlike the daemon adapter (which treats a QR as
 * "needs repair" and bails) and the CLI (which renders the QR in a terminal),
 * this keeps a short-lived Baileys socket open, captures the QR *string*, and
 * exposes phase + QR for polling over the bus. On success it fires `onPaired`
 * so the channel service can bring the real adapter up with the fresh creds.
 */

import path from 'node:path';
import { rm } from 'node:fs/promises';
import type { WASocket } from '@whiskeysockets/baileys';
import { getDataPaths } from '../../../../lib/paths.js';
import { createLogger } from '../../../../lib/logger.js';
import { createWhatsAppSocket } from './session.js';

const log = createLogger('wa-pair');
const QR_TIMEOUT_MS = 150_000; // ~2.5 min: Baileys rotates the QR a few times, then we give up
const MAX_RESTARTS = 4;

export type PairPhase =
  | 'idle'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'saved'
  | 'expired'
  | 'error';

export interface PairStatus {
  phase: PairPhase;
  /** Raw QR payload — the caller renders it as an image. */
  qr?: string;
  name?: string;
  error?: string;
}

interface Session {
  phase: PairPhase;
  qr?: string;
  name?: string;
  error?: string;
  sock?: WASocket;
  restarts: number;
  timer?: NodeJS.Timeout;
}

export class WhatsAppPairing {
  private sessions = new Map<string, Session>();

  /** Fired once creds are flushed to disk. Typically restarts the real adapter. */
  constructor(private readonly onPaired: (id: string) => void) {}

  status(id: string): PairStatus {
    const s = this.sessions.get(id);
    if (!s) return { phase: 'idle' };
    return { phase: s.phase, qr: s.qr, name: s.name, error: s.error };
  }

  async start(id: string, opts: { reset?: boolean } = {}): Promise<PairStatus> {
    const existing = this.sessions.get(id);
    if (
      existing &&
      (existing.phase === 'connecting' || existing.phase === 'qr' || existing.phase === 'connected')
    ) {
      return this.status(id); // already in flight — idempotent
    }
    await this.cancel(id);

    const authDir = path.join(getDataPaths().channelsDir, id);
    if (opts.reset) {
      await rm(authDir, { recursive: true, force: true });
      log.info(`${id}: cleared auth dir`);
    }

    const s: Session = { phase: 'connecting', restarts: 0 };
    this.sessions.set(id, s);
    this.arm(id, s);
    await this.connect(id, authDir, s);
    return this.status(id);
  }

  async cancel(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    try {
      s.sock?.end(undefined);
    } catch {
      /* already closing */
    }
    this.sessions.delete(id);
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) void this.cancel(id);
  }

  private arm(id: string, s: Session): void {
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      const cur = this.sessions.get(id);
      if (!cur || cur.phase === 'saved' || cur.phase === 'connected') return;
      cur.phase = 'expired';
      try {
        cur.sock?.end(undefined);
      } catch {
        /* ignore */
      }
    }, QR_TIMEOUT_MS);
    s.timer.unref?.();
  }

  private async connect(id: string, authDir: string, s: Session): Promise<void> {
    try {
      s.sock = await createWhatsAppSocket(authDir, {
        onMessage: () => {},
        onQR: (qr) => {
          s.qr = qr;
          if (s.phase === 'connecting' || s.phase === 'qr') s.phase = 'qr';
        },
        onConnected: (name) => {
          s.name = name;
          s.phase = 'connected';
        },
        onCredsSaved: () => {
          if (s.phase !== 'connected') return; // creds.update fires repeatedly during handshake
          s.phase = 'saved';
          if (s.timer) clearTimeout(s.timer);
          try {
            s.sock?.end(undefined);
          } catch {
            /* ignore */
          }
          log.info(`${id}: paired as ${s.name ?? '?'} — creds saved`);
          this.onPaired(id);
        },
        onDisconnected: (reason) => {
          if (s.phase === 'saved' || s.phase === 'connected') return; // expected teardown
          if (reason === 'restart_required' && s.restarts < MAX_RESTARTS) {
            s.restarts += 1;
            log.info(`${id}: restart_required — reconnecting (${s.restarts}/${MAX_RESTARTS})`);
            void this.connect(id, authDir, s);
            return;
          }
          s.phase = 'error';
          s.error = reason;
        },
      });
    } catch (err) {
      s.phase = 'error';
      s.error = err instanceof Error ? err.message : String(err);
      log.error(`${id}: pairing socket failed: ${s.error}`);
    }
  }
}
