/**
 * Browser automation service
 * Clean abstraction over Playwright for browser automation
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  currentUrl?: string;
  startedAt: number;
}

export interface SnapshotResult {
  title: string;
  url: string;
  elements: Array<{
    ref: string;
    role: string;
    name?: string;
    content?: string;
  }>;
}

export class BrowserService {
  private sessions = new Map<string, BrowserSession>();
  private sessionCounter = 0;

  async createSession(): Promise<BrowserSession> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    this.sessionCounter++;
    const id = `browser-${this.sessionCounter}`;

    const session: BrowserSession = {
      id,
      browser,
      context,
      page,
      startedAt: Date.now(),
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): BrowserSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Array<{ id: string; url?: string; startedAt: number }> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      url: s.currentUrl,
      startedAt: s.startedAt,
    }));
  }

  async closeSession(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;

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

  async navigate(sessionId: string, url: string): Promise<{ url: string; title: string }> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    session.currentUrl = session.page.url();
    return {
      url: session.currentUrl,
      title: await session.page.title(),
    };
  }

  async getSnapshot(sessionId: string, maxChars?: number): Promise<string> {
    const session = this.getSessionOrThrow(sessionId);
    const page = session.page;

    const title = await page.title();
    const url = page.url();

    // Get interactive elements
    const elements = await page.$$eval(
      'a, button, input, textarea, select, [role="button"], [role="link"]',
      (els, maxC) => {
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
    const index = parseInt(ref.replace('e', ''), 10) - 1;
    
    const elements = await session.page.$$('input, textarea');
    if (index < 0 || index >= elements.length) {
      throw new Error(`Input element ${ref} not found`);
    }

    await elements[index].fill(text);
  }

  async screenshot(sessionId: string, options?: { fullPage?: boolean }): Promise<Buffer> {
    const session = this.getSessionOrThrow(sessionId);
    return await session.page.screenshot({
      fullPage: options?.fullPage ?? false,
      type: 'png',
    });
  }

  async pdf(sessionId: string): Promise<Buffer> {
    const session = this.getSessionOrThrow(sessionId);
    return await session.page.pdf({ format: 'A4' });
  }

  async evaluate(sessionId: string, script: string): Promise<unknown> {
    const session = this.getSessionOrThrow(sessionId);
    return await session.page.evaluate((code) => {
      // eslint-disable-next-line no-eval
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
}

// Singleton
let globalBrowserService: BrowserService | null = null;

export function getBrowserService(): BrowserService {
  if (!globalBrowserService) {
    globalBrowserService = new BrowserService();
  }
  return globalBrowserService;
}
