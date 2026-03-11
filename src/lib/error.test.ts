import { describe, it, expect } from 'vitest';
import { toMessage, sanitizeError, classifyError, friendlyError } from './error.js';

describe('toMessage', () => {
  it('extracts message from Error', () => {
    expect(toMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(toMessage('string error')).toBe('string error');
    expect(toMessage(42)).toBe('42');
    expect(toMessage(null)).toBe('null');
  });
});

describe('sanitizeError', () => {
  it('scrubs Bearer tokens', () => {
    expect(sanitizeError('Bearer sk-abc123def456')).toBe('Bearer ***');
  });

  it('scrubs JWT Bearer tokens', () => {
    expect(sanitizeError('Bearer eyJhbGciOi.payload.sig+/=')).toBe('Bearer ***');
  });

  it('scrubs common API key prefixes', () => {
    expect(sanitizeError('key sk-abcdefghijklmnop')).toBe('key sk-***');
    expect(sanitizeError('token xoxb-12345678-abcdefgh')).toBe('token xoxb-***');
    expect(sanitizeError('ghp-abcdefghijklmnop')).toBe('ghp-***');
  });

  it('scrubs key=value patterns', () => {
    expect(sanitizeError('api_key=my-secret-key')).toBe('api_key=***');
    expect(sanitizeError('token: secret123')).toBe('token=***');
    expect(sanitizeError('password=hunter2 other')).toBe('password=*** other');
  });

  it('scrubs URL-embedded credentials', () => {
    expect(sanitizeError('postgresql://user:s3cret@localhost/db')).toBe('postgresql://user:***@localhost/db');
    expect(sanitizeError('https://admin:pass123@api.example.com')).toBe('https://admin:***@api.example.com');
  });

  it('leaves safe strings untouched', () => {
    expect(sanitizeError('connection refused at localhost:8080')).toBe('connection refused at localhost:8080');
  });
});

describe('classifyError', () => {
  it('detects auth errors', () => {
    expect(classifyError('401 Unauthorized')).toBe('auth');
    expect(classifyError('403 Forbidden')).toBe('auth');
    expect(classifyError('Invalid API key provided')).toBe('auth');
    expect(classifyError('invalid auth token')).toBe('auth');
  });

  it('detects rate limit errors', () => {
    expect(classifyError('429 Too Many Requests')).toBe('rate_limit');
    expect(classifyError('Rate limit exceeded')).toBe('rate_limit');
    expect(classifyError('quota exceeded')).toBe('rate_limit');
    expect(classifyError('billing limit reached')).toBe('rate_limit');
  });

  it('detects timeout errors', () => {
    expect(classifyError('Request timed out')).toBe('timeout');
    expect(classifyError('ETIMEDOUT')).toBe('timeout');
    expect(classifyError('deadline exceeded')).toBe('timeout');
  });

  it('detects transient errors', () => {
    expect(classifyError('502 Bad Gateway')).toBe('transient');
    expect(classifyError('503 Service Unavailable')).toBe('transient');
    expect(classifyError('ECONNRESET')).toBe('transient');
    expect(classifyError('ECONNREFUSED')).toBe('transient');
    expect(classifyError('fetch failed')).toBe('transient');
    expect(classifyError('socket hang up')).toBe('transient');
  });

  it('returns unknown for unrecognized errors', () => {
    expect(classifyError('something broke')).toBe('unknown');
    expect(classifyError('null pointer exception')).toBe('unknown');
  });
});

describe('friendlyError', () => {
  it('transient', () => {
    expect(friendlyError('transient')).toContain('try again');
  });

  it('auth', () => {
    expect(friendlyError('auth')).toContain('authentication');
  });

  it('rate_limit', () => {
    expect(friendlyError('rate_limit')).toContain('wait');
  });

  it('timeout', () => {
    expect(friendlyError('timeout')).toContain('timed out');
  });

  it('unknown', () => {
    expect(friendlyError('unknown')).toContain('went wrong');
  });
});
