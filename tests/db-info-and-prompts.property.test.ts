/**
 * Property-Based Tests for db_info output and connection_info prompt
 *
 * Tests that db_info never exposes passwords, always includes required
 * fields, and that connection_info prompt correctly describes the server.
 * Also covers MYSQL_QUERY_TIMEOUT_MS parsing edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { createConfigFromEnv } from '../src/connection-manager';
import { buildConnectionInfoPrompt, createDbInfoOutput, DEFAULT_TIMEOUT_MS } from '../src/server-info';
import { LIMITS } from '../src/types';

fc.configureGlobal({ numRuns: 100 });

const hostnameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 3, maxLength: 30 }
);

const usernameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
  { minLength: 3, maxLength: 20 }
);

const passwordArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'.split('')),
  { minLength: 8, maxLength: 32 }
);

const databaseNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
  { minLength: 3, maxLength: 30 }
);

const validPortArb = fc.integer({ min: 1024, max: 65535 });
const validTimeoutArb = fc.integer({ min: 1000, max: 600000 });

const databaseConfigArb = fc.record({
  name: databaseNameArb,
  host: hostnameArb,
  port: validPortArb,
  user: usernameArb,
  password: passwordArb,
  database: databaseNameArb,
  queryTimeoutMs: validTimeoutArb
});

// ─── db_info output ───────────────────────────────────────────────────────────

describe('createDbInfoOutput', () => {
  it('always includes required fields', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const info = createDbInfoOutput(config);
        expect(typeof info.database).toBe('string');
        expect(typeof info.host).toBe('string');
        expect(typeof info.port).toBe('number');
        expect(typeof info.user).toBe('string');
        expect(typeof info.queryTimeoutMs).toBe('number');
        expect(typeof info.note).toBe('string');
      })
    );
  });

  it('reflects the config values exactly', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const info = createDbInfoOutput(config);
        expect(info.database).toBe(config.database);
        expect(info.host).toBe(config.host);
        expect(info.port).toBe(config.port);
        expect(info.user).toBe(config.user);
        expect(info.queryTimeoutMs).toBe(config.queryTimeoutMs);
      })
    );
  });

  it('never exposes the password', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const info = createDbInfoOutput(config);
        const serialised = JSON.stringify(info);
        expect(serialised).not.toContain(config.password);
        expect(info).not.toHaveProperty('password');
      })
    );
  });

  it('note mentions the database name', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const info = createDbInfoOutput(config);
        expect(info.note).toContain(config.database);
      })
    );
  });
});

// ─── connection_info prompt ───────────────────────────────────────────────────

describe('buildConnectionInfoPrompt', () => {
  it('contains database, host, port, and user', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const prompt = buildConnectionInfoPrompt(config);
        expect(prompt).toContain(config.database);
        expect(prompt).toContain(config.host);
        expect(prompt).toContain(String(config.port));
        expect(prompt).toContain(config.user);
      })
    );
  });

  it('never exposes the password', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const prompt = buildConnectionInfoPrompt(config);
        expect(prompt).not.toContain(config.password);
      })
    );
  });

  it('contains the IMPORTANT scope warning', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const prompt = buildConnectionInfoPrompt(config);
        expect(prompt).toContain('IMPORTANT');
        expect(prompt).toContain('ONLY');
      })
    );
  });

  it('lists all available tools', () => {
    fc.assert(
      fc.property(databaseConfigArb, (config) => {
        const prompt = buildConnectionInfoPrompt(config);
        const expectedTools = ['list_tables', 'describe_table', 'preview_data',
          'run_query', 'show_relations', 'db_stats', 'db_info'];
        for (const tool of expectedTools) {
          expect(prompt).toContain(tool);
        }
      })
    );
  });
});

// ─── MYSQL_QUERY_TIMEOUT_MS parsing ──────────────────────────────────────────

describe('createConfigFromEnv — MYSQL_QUERY_TIMEOUT_MS parsing', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD',
    'MYSQL_DATABASE', 'MYSQL_QUERY_TIMEOUT_MS'];

  beforeEach(() => {
    for (const k of envKeys) savedEnv[k] = process.env[k];
    process.env.MYSQL_HOST = 'localhost';
    process.env.MYSQL_PORT = '3306';
    process.env.MYSQL_USER = 'root';
    process.env.MYSQL_PASSWORD = 'pass';
    process.env.MYSQL_DATABASE = 'testdb';
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('uses the value when it is a valid integer >= 1000', () => {
    fc.assert(
      fc.property(validTimeoutArb, (ms) => {
        process.env.MYSQL_QUERY_TIMEOUT_MS = String(ms);
        const config = createConfigFromEnv();
        expect(config.queryTimeoutMs).toBe(ms);
      })
    );
  });

  it('falls back to default when value is below 1000', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), (ms) => {
        process.env.MYSQL_QUERY_TIMEOUT_MS = String(ms);
        const config = createConfigFromEnv();
        expect(config.queryTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
      })
    );
  });

  it('falls back to default when value is 0 or negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: 0 }), (ms) => {
        process.env.MYSQL_QUERY_TIMEOUT_MS = String(ms);
        const config = createConfigFromEnv();
        expect(config.queryTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
      })
    );
  });

  it('falls back to default for non-numeric strings', () => {
    for (const val of ['abc', '', 'NaN', 'Infinity', '30s', '1e3']) {
      process.env.MYSQL_QUERY_TIMEOUT_MS = val;
      const config = createConfigFromEnv();
      expect(config.queryTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    }
  });

  it('falls back to default when env var is unset', () => {
    delete process.env.MYSQL_QUERY_TIMEOUT_MS;
    const config = createConfigFromEnv();
    expect(config.queryTimeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('accepts the minimum allowed value of 1000', () => {
    process.env.MYSQL_QUERY_TIMEOUT_MS = '1000';
    const config = createConfigFromEnv();
    expect(config.queryTimeoutMs).toBe(1000);
  });

  it('default value equals LIMITS.TIMEOUT_MS', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(LIMITS.TIMEOUT_MS);
  });
});
