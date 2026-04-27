import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from '../frontmatter.js';

describe('frontmatter parser', () => {
  describe('parseFrontmatter', () => {
    it('parses valid single-line frontmatter', () => {
      const content = `---
type: prompt
version: 1
---

This is the body`;
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result?.meta).toEqual({
        type: 'prompt',
        version: 1,
      });
      expect(result?.body).toBe('This is the body');
    });

    it('parses multi-line array frontmatter (cron tasks)', () => {
      const content = `---
name: daily-sync
schedule:
  - "0 9 * * *"
  - "0 17 * * *"
enabled: true
---

Run daily sync at 9am and 5pm`;
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result?.meta).toEqual({
        name: 'daily-sync',
        schedule: ['0 9 * * *', '0 17 * * *'],
        enabled: true,
      });
      expect(result?.body).toBe('Run daily sync at 9am and 5pm');
    });

    it('handles boolean values', () => {
      const content = `---
enabled: true
archived: false
---

Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta).toEqual({
        enabled: true,
        archived: false,
      });
    });

    it('handles JSON array values', () => {
      const content = `---
tags: ["research", "automation"]
numbers: [1, 2, 3]
---

Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta).toEqual({
        tags: ['research', 'automation'],
        numbers: [1, 2, 3],
      });
    });

    it('strips quotes from string values', () => {
      const content = `---
title: "My Prompt"
desc: 'Single quoted'
name: Unquoted
---

Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta).toEqual({
        title: 'My Prompt',
        desc: 'Single quoted',
        name: 'Unquoted',
      });
    });

    it('returns null for content without frontmatter', () => {
      const result = parseFrontmatter('No frontmatter here\nJust body');
      expect(result).toBeNull();
    });

    it('returns null for empty frontmatter', () => {
      const content = `---
---

Body`;
      const result = parseFrontmatter(content);
      expect(result).toBeNull();
    });

    it('skips empty lines in frontmatter', () => {
      const content = `---
type: prompt

name: test

version: 1
---

Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta).toEqual({
        type: 'prompt',
        name: 'test',
        version: 1,
      });
    });

    it('skips lines without colons', () => {
      const content = `---
type: prompt
invalid line without colon
name: test
---

Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta).toEqual({
        type: 'prompt',
        name: 'test',
      });
    });

    it('handles frontmatter with no trailing newline in body', () => {
      const content = `---
type: prompt
---
Body without newline`;
      const result = parseFrontmatter(content);

      expect(result?.body).toBe('Body without newline');
    });

    it('real-world: channel instructions file', () => {
      const content = `---
type: prompt
version: 1
---

<!-- Custom instructions for Telegram channel -->
Custom behavior for handling mentions and routing.

Use channel context variables: \${CHANNEL_ID}, \${USER_ID}, \${BOT_NAME}`;
      const result = parseFrontmatter(content);

      expect(result?.meta.type).toBe('prompt');
      expect(result?.meta.version).toBe(1);
      expect(result?.body).toContain('Custom instructions');
      expect(result?.body).toContain('${CHANNEL_ID}');
    });

    it('real-world: cron task with multiple schedules', () => {
      const content = `---
id: data-pipeline
task: process-daily-reports
schedule:
  - "0 6 * * MON-FRI"
  - "0 12 * * *"
  - "0 18 * * SAT,SUN"
enabled: true
description: "Data pipeline execution"
---

Execute data processing pipeline with validation checks`;
      const result = parseFrontmatter(content);

      expect(result?.meta).toEqual({
        id: 'data-pipeline',
        task: 'process-daily-reports',
        schedule: ['0 6 * * MON-FRI', '0 12 * * *', '0 18 * * SAT,SUN'],
        enabled: true,
        description: 'Data pipeline execution',
      });
    });

    it('handles mixed single-line and multi-line values', () => {
      const content = `---
name: complex-task
enabled: true
crons:
  - "0 9 * * *"
  - "0 21 * * *"
tags: ["urgent", "daily"]
---

Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta).toEqual({
        name: 'complex-task',
        enabled: true,
        crons: ['0 9 * * *', '0 21 * * *'],
        tags: ['urgent', 'daily'],
      });
    });

    it('returns null for malformed input', () => {
      expect(parseFrontmatter(null as unknown as string)).toBeNull();
      expect(parseFrontmatter(undefined as unknown as string)).toBeNull();
      expect(parseFrontmatter(123 as unknown as string)).toBeNull();
    });
  });

  describe('serializeFrontmatter', () => {
    it('serializes simple metadata', () => {
      const meta = { type: 'prompt', version: 1 };
      const body = 'This is the body';
      const result = serializeFrontmatter(meta, body);

      expect(result).toContain('---\n');
      expect(result).toContain('type: "prompt"');
      expect(result).toContain('version: 1');
      expect(result).toContain('---\n\n');
      expect(result).toContain('This is the body\n');
    });

    it('serializes multi-line arrays', () => {
      const meta = {
        name: 'daily-sync',
        schedule: ['0 9 * * *', '0 17 * * *'],
      };
      const body = 'Sync task';
      const result = serializeFrontmatter(meta, body);

      expect(result).toContain('name: "daily-sync"');
      expect(result).toContain('schedule:');
      expect(result).toContain('  - 0 9 * * *');
      expect(result).toContain('  - 0 17 * * *');
    });

    it('serializes boolean values without quotes', () => {
      const meta = { enabled: true, archived: false };
      const body = 'Body';
      const result = serializeFrontmatter(meta, body);

      expect(result).toContain('enabled: true');
      expect(result).toContain('archived: false');
    });

    it('serializes and deserializes round-trip correctly', () => {
      const originalMeta = {
        type: 'prompt',
        enabled: true,
        tags: ['research', 'automation'],
        schedule: ['0 9 * * *', '0 17 * * *'],
      };
      const originalBody = 'This is the task body';

      const serialized = serializeFrontmatter(originalMeta, originalBody);
      const parsed = parseFrontmatter(serialized);

      expect(parsed?.meta).toEqual(originalMeta);
      expect(parsed?.body).toBe(originalBody);
    });

    it('real-world: cron task serialization', () => {
      const meta = {
        id: 'daily-report',
        task: 'generate-metrics',
        schedule: ['0 6 * * *'],
        enabled: true,
      };
      const body = 'Generate daily metrics report';

      const result = serializeFrontmatter(meta, body);
      const parsed = parseFrontmatter(result);

      expect(parsed?.meta).toEqual(meta);
      expect(parsed?.body).toBe(body);
    });
  });

  describe('integration: parse + validate type field', () => {
    it('accepts frontmatter with type: prompt', () => {
      const content = `---
type: prompt
---
Instructions here`;
      const result = parseFrontmatter(content);

      expect(result?.meta.type).toBe('prompt');
    });

    it('detects mismatched type field', () => {
      const content = `---
type: task
name: something
---
Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta.type).not.toBe('prompt');
      expect(result?.meta.type).toBe('task');
    });

    it('handles missing type field', () => {
      const content = `---
name: something
version: 1
---
Body`;
      const result = parseFrontmatter(content);

      expect(result?.meta.type).toBeUndefined();
    });
  });
});
