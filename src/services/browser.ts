/**
 * Browser automation service
 * Playwright-based with session limits, idle cleanup, and auth state persistence
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { resolveDataDir } from '../config/paths.js';

const MAX_SESSIONS = 5;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  currentUrl?: string;
  startedAt: number;
  lastActivityAt: number;
}

export interface BrowserServiceConfig {
  stateDir?: string;
}

export class BrowserService {
  private sessions = new Map<string, BrowserSession>();
  private sessionCounter = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private stateDir: string;

  constructor(config?: BrowserServiceConfig) {
    this.stateDir = config?.stateDir ?? path.join(resolveDataDir(), 'browser-state');
    this.cleanupTimer = setInterval(() => this.reapIdle(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  async createSession(options?: { restoreFrom?: string }): Promise<BrowserSession> {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Session limit reached (max ${MAX_SESSIONS}). Close an existing session first.`);
    }

    const browser = await chromium.launch({ headless: true });

    let storageState: string | undefined;
    if (options?.restoreFrom) {
      const statePath = this.storageStatePath(options.restoreFrom);
      try {
        await fs.access(statePath);
        storageState = statePath;
      } catch { /* no saved state — start fresh */ }
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();

    this.sessionCounter++;
    const id = `browser-${this.sessionCounter}`;
    const now = Date.now();

    const session: BrowserSession = {
      id,
      browser,
      context,
      page,
      startedAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): BrowserSession | undefined {
    return this.sessions.get(id);
  }

  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.lastActivityAt = Date.now();
  }

  listSessions(): Array<{ id: string; url?: string; startedAt: number; idleMs: number }> {
    const now = Date.now();
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      url: s.currentUrl,
      startedAt: s.startedAt,
      idleMs: now - s.lastActivityAt,
    }));
  }

  async closeSession(id: string, options?: { saveState?: boolean }): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;

    if (options?.saveState) {
      await this.saveStorageState(session);
    }

    await session.browser.close();
    this.sessions.delete(id);
    return true;
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.browser.close().catch(() => {});
    }
    this.sessions.clear();
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async navigate(sessionId: string, url: string): Promise<{ url: string; title: string }> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    session.currentUrl = session.page.url();
    session.lastActivityAt = Date.now();
    return {
      url: session.currentUrl,
      title: await session.page.title(),
    };
  }

  async getSnapshot(sessionId: string, maxChars?: number): Promise<string> {
    const session = this.getSessionOrThrow(sessionId);
    session.lastActivityAt = Date.now();
    const page = session.page;

    const title = await page.title();
    const url = page.url();

    const elements = await page.$$eval(
      'a, button, input, textarea, select, [role="button"], [role="link"]',
      (els, _maxC) => {
        return els.slice(0, 50).map((el, i) => {
          const ref = `e${i + 1}`;
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const name = el.getAttribute('aria-label') ||
                      el.textContent?.slice(0, 50) ||
                      el.getAttribute('placeholder') ||
                      el.getAttribute('name') ||
                      '';
          return { ref, role, name: name.trim() };
        });
      },
      maxChars
    );

    let result = `# ${title}\n${url}\n\n`;

    for (const el of elements) {
      if (el.name) {
        result += `[${el.ref}] ${el.role}: ${el.name}\n`;
      } else {
        result += `[${el.ref}] ${el.role}\n`;
      }
    }

    if (maxChars && result.length > maxChars) {
      result = result.slice(0, maxChars) + '\n... (truncated)';
    }

    return result;
  }

  async click(sessionId: string, ref: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.lastActivityAt = Date.now();
    const index = parseInt(ref.replace('e', ''), 10) - 1;

    const elements = await session.page.$$('a, button, input, textarea, select, [role="button"], [role="link"]');
    if (index < 0 || index >= elements.length) {
      throw new Error(`Element ${ref} not found`);
    }

    await elements[index].click();
    session.currentUrl = session.page.url();
  }

  async type(sessionId: string, ref: string, text: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.lastActivityAt = Date.now();
    const index = parseInt(ref.replace('e', ''), 10) - 1;

    const elements = await session.page.$$('input, textarea');
    if (index < 0 || index >= elements.length) {
      throw new Error(`Input element ${ref} not found`);
    }

    await elements[index].fill(text);
  }

  async screenshot(sessionId: string, options?: { fullPage?: boolean }): Promise<Buffer> {
    const session = this.getSessionOrThrow(sessionId);
    session.lastActivityAt = Date.now();
    return await session.page.screenshot({
      fullPage: options?.fullPage ?? false,
      type: 'png',
    });
  }

  async pdf(sessionId: string): Promise<Buffer> {
    const session = this.getSessionOrThrow(sessionId);
    session.lastActivityAt = Date.now();
    return await session.page.pdf({ format: 'A4' });
  }

  async evaluate(sessionId: string, script: string): Promise<unknown> {
    const session = this.getSessionOrThrow(sessionId);
    session.lastActivityAt = Date.now();
    return await session.page.evaluate((code) => {
      return eval(code);
    }, script);
  }

  private getSessionOrThrow(id: string): BrowserSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Browser session not found: ${id}`);
    }
    return session;
  }

  private async reapIdle(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > IDLE_TIMEOUT_MS) {
        await session.browser.close().catch(() => {});
        this.sessions.delete(id);
      }
    }
  }

  private storageStatePath(sessionId: string): string {
    return path.join(this.stateDir, `${sessionId}.json`);
  }

  private async saveStorageState(session: BrowserSession): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
    await session.context.storageState({ path: this.storageStatePath(session.id) });
  }
}

// Singleton
let globalBrowserService: BrowserService | null = null;

export function getBrowserService(): BrowserService {
  if (!globalBrowserService) {
    globalBrowserService = new BrowserService();
  }
  return globalBrowserService;
}
