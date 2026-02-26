/** Readline-based prompts — replaces @clack/prompts to avoid process.exit on cancel */

import chalk from 'chalk';
import { emitKeypressEvents } from 'node:readline';

const write = (s: string) => process.stderr.write(s);

type Key = { name: string; ctrl?: boolean; shift?: boolean };

/** Acquire raw stdin, run callback, then restore */
function withRawMode<T>(fn: (onKey: (handler: (ch: string | undefined, key?: Key) => void) => void) => Promise<T>): Promise<T> {
  return fn((handler) => {
    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', handler);
  }).finally(() => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  });
}

function isCancelKey(key?: Key): boolean {
  return !!key && (key.name === 'escape' || (key.ctrl === true && key.name === 'c'));
}

// ── select ──────────────────────────────────────────────────────────

export interface PickOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export function pick<T extends string>(message: string, options: PickOption<T>[], initial?: T): Promise<T | null> {
  return new Promise((resolve) => {
    let cursor = initial ? Math.max(0, options.findIndex(o => o.value === initial)) : 0;
    let done = false;
    const lines = options.length + 1;

    const draw = (clear = false) => {
      if (clear) write(`\x1B[${lines}A\x1B[J`);
      write(`${chalk.cyan('◆')}  ${message}\n`);
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const active = i === cursor;
        const bullet = active ? chalk.green('●') : chalk.dim('○');
        const text = active ? `${o.label}${o.hint ? chalk.dim(` (${o.hint})`) : ''}` : chalk.dim(o.label);
        write(`${chalk.cyan('│')}  ${bullet} ${text}\n`);
      }
    };

    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      write(`\x1B[${lines}A\x1B[J`);
      if (value !== null) {
        const picked = options.find(o => o.value === value);
        write(`${chalk.green('◇')}  ${message}\n${chalk.gray('│')}  ${chalk.dim(picked?.label ?? String(value))}\n`);
      } else {
        write(`${chalk.yellow('■')}  ${message}\n`);
      }
      resolve(value);
    };

    const onKey = (_ch: string | undefined, key?: Key) => {
      if (!key || done) return;
      if (key.name === 'up') { cursor = (cursor - 1 + options.length) % options.length; draw(true); }
      else if (key.name === 'down') { cursor = (cursor + 1) % options.length; draw(true); }
      else if (key.name === 'return') finish(options[cursor].value);
      else if (isCancelKey(key)) finish(null);
    };

    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', onKey);
    draw();
  });
}

// ── text ────────────────────────────────────────────────────────────

export interface TextOptions {
  placeholder?: string;
  initial?: string;
  validate?: (value: string) => string | undefined;
}

export function pickText(message: string, opts?: TextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let value = opts?.initial ?? '';
    let cursorPos = value.length;
    let error = '';
    let done = false;

    const draw = (clear = false) => {
      if (clear) write('\x1B[2A\x1B[J');
      const display = value || (opts?.placeholder ? chalk.dim(opts.placeholder) : '');
      const errLine = error ? chalk.red(`  ${error}`) : '';
      write(`${chalk.cyan('◆')}  ${message}\n`);
      write(`${chalk.cyan('│')}  ${display}${errLine}\n`);
    };

    const finish = (result: string | null) => {
      if (done) return;
      done = true;
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      write('\x1B[2A\x1B[J');
      if (result !== null) {
        write(`${chalk.green('◇')}  ${message}\n${chalk.gray('│')}  ${chalk.dim(result)}\n`);
      } else {
        write(`${chalk.yellow('■')}  ${message}\n`);
      }
      resolve(result);
    };

    const onKey = (ch: string | undefined, key?: Key) => {
      if (done) return;
      if (isCancelKey(key)) { finish(null); return; }

      if (key?.name === 'return') {
        const final = value || opts?.initial || '';
        if (opts?.validate) {
          const err = opts.validate(final);
          if (err) { error = err; draw(true); return; }
        }
        finish(final);
        return;
      }

      if (key?.name === 'backspace') {
        if (cursorPos > 0) { value = value.slice(0, cursorPos - 1) + value.slice(cursorPos); cursorPos--; }
      } else if (key?.name === 'delete') {
        value = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
      } else if (key?.name === 'left') {
        if (cursorPos > 0) cursorPos--;
      } else if (key?.name === 'right') {
        if (cursorPos < value.length) cursorPos++;
      } else if (key?.name === 'home' || (key?.ctrl && key.name === 'a')) {
        cursorPos = 0;
      } else if (key?.name === 'end' || (key?.ctrl && key.name === 'e')) {
        cursorPos = value.length;
      } else if (ch && !key?.ctrl && ch.length === 1) {
        value = value.slice(0, cursorPos) + ch + value.slice(cursorPos);
        cursorPos++;
      }

      error = '';
      draw(true);
    };

    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', onKey);
    draw();
  });
}

// ── confirm ─────────────────────────────────────────────────────────

export function pickConfirm(message: string, initial = false): Promise<boolean | null> {
  return new Promise((resolve) => {
    let value = initial;
    let done = false;

    const draw = (clear = false) => {
      if (clear) write('\x1B[1A\x1B[J');
      const yes = value ? chalk.green.underline('Yes') : chalk.dim('Yes');
      const no = !value ? chalk.red.underline('No') : chalk.dim('No');
      write(`${chalk.cyan('◆')}  ${message} ${yes} ${chalk.dim('/')} ${no}\n`);
    };

    const finish = (result: boolean | null) => {
      if (done) return;
      done = true;
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      write('\x1B[1A\x1B[J');
      if (result !== null) {
        write(`${chalk.green('◇')}  ${message} ${chalk.dim(result ? 'Yes' : 'No')}\n`);
      } else {
        write(`${chalk.yellow('■')}  ${message}\n`);
      }
      resolve(result);
    };

    const onKey = (_ch: string | undefined, key?: Key) => {
      if (done) return;
      if (isCancelKey(key)) { finish(null); return; }
      if (key?.name === 'left' || key?.name === 'right') { value = !value; draw(true); }
      else if (key?.name === 'return') finish(value);
      else if (_ch === 'y' || _ch === 'Y') { value = true; finish(true); }
      else if (_ch === 'n' || _ch === 'N') { value = false; finish(false); }
    };

    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', onKey);
    draw();
  });
}

// ── multiselect ─────────────────────────────────────────────────────

export function pickMulti<T extends string>(
  message: string,
  options: PickOption<T>[],
  initial: T[] = [],
): Promise<T[] | null> {
  return new Promise((resolve) => {
    let cursor = 0;
    const selected = new Set<T>(initial);
    let done = false;
    const lines = options.length + 2; // header + options + hint line

    const draw = (clear = false) => {
      if (clear) write(`\x1B[${lines}A\x1B[J`);
      write(`${chalk.cyan('◆')}  ${message}\n`);
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const active = i === cursor;
        const checked = selected.has(o.value);
        const box = checked ? chalk.green('■') : chalk.dim('□');
        const text = active ? o.label : chalk.dim(o.label);
        write(`${chalk.cyan('│')}  ${box} ${text}\n`);
      }
      write(`${chalk.cyan('│')}  ${chalk.dim('space=toggle  enter=confirm')}\n`);
    };

    const finish = (result: T[] | null) => {
      if (done) return;
      done = true;
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      write(`\x1B[${lines}A\x1B[J`);
      if (result !== null) {
        const labels = result.map(v => options.find(o => o.value === v)?.label ?? v);
        write(`${chalk.green('◇')}  ${message}\n${chalk.gray('│')}  ${chalk.dim(labels.join(', ') || 'none')}\n`);
      } else {
        write(`${chalk.yellow('■')}  ${message}\n`);
      }
      resolve(result);
    };

    const onKey = (_ch: string | undefined, key?: Key) => {
      if (!key || done) return;
      if (key.name === 'up') { cursor = (cursor - 1 + options.length) % options.length; draw(true); }
      else if (key.name === 'down') { cursor = (cursor + 1) % options.length; draw(true); }
      else if (key.name === 'return') finish([...selected]);
      else if (isCancelKey(key)) finish(null);
      else if (_ch === ' ') {
        const val = options[cursor].value;
        if (selected.has(val)) selected.delete(val); else selected.add(val);
        draw(true);
      }
    };

    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', onKey);
    draw();
  });
}
