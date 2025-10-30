import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  EMAIL: process.env.EMAIL,
  PASSWORD: process.env.PASSWORD,
  MONEYLOVER_TOKEN: process.env.MONEYLOVER_TOKEN,
  MONEY_LOVER_TOKEN: process.env.MONEY_LOVER_TOKEN,
  MONEYLOVER_MCP_DISABLE_ENV_FILE: process.env.MONEYLOVER_MCP_DISABLE_ENV_FILE,
  MONEYLOVER_MCP_ENV_FILE: process.env.MONEYLOVER_MCP_ENV_FILE
};

const restoreEnv = () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

describe('Money Lover MCP server env token resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.MONEYLOVER_MCP_DISABLE_ENV_FILE = '1';
    delete process.env.MONEYLOVER_MCP_ENV_FILE;
    delete process.env.MONEYLOVER_TOKEN;
    delete process.env.MONEY_LOVER_TOKEN;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('throws when token is missing and env credentials are unset', async () => {
    delete process.env.EMAIL;
    delete process.env.PASSWORD;

    vi.doMock('../src/tokenCache.js', () => ({
      readToken: vi.fn(),
      writeToken: vi.fn(),
      removeToken: vi.fn()
    }));

    vi.doMock('../src/moneyloverClient.js', () => ({
      MoneyloverClient: class {
        constructor() {}
      },
      MoneyloverApiError: class extends Error {}
    }));

    const { __test } = await import('../src/server.js');
    __test.clearEnvTokenCache();

    await expect(__test.runWithClient(undefined, () => Promise.resolve('ok'))).rejects.toThrow(
      'Token is required'
    );
  });

  it('uses env credentials when token argument is omitted', async () => {
    process.env.EMAIL = 'user@example.com';
    process.env.PASSWORD = 'secret';

    const getToken = vi.fn().mockResolvedValue('token-from-env');
    const constructedTokens = [];
    const readToken = vi.fn().mockResolvedValue(null);
    const writeToken = vi.fn().mockResolvedValue();
    const removeToken = vi.fn().mockResolvedValue();

    class MockClient {
      constructor(token) {
        constructedTokens.push(token);
        this.token = token;
      }

      getUserInfo() {
        return { ok: true };
      }

      static getToken = getToken;
    }

    class MockError extends Error {}

    vi.doMock('../src/moneyloverClient.js', () => ({
      MoneyloverClient: MockClient,
      MoneyloverApiError: MockError
    }));

    vi.doMock('../src/tokenCache.js', () => ({
      readToken,
      writeToken,
      removeToken
    }));

    const { __test } = await import('../src/server.js');
    __test.clearEnvTokenCache();

    const result = await __test.runWithClient(undefined, client => client.getUserInfo());

    expect(result).toEqual({ ok: true });
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(constructedTokens).toEqual(['token-from-env']);
    expect(readToken).toHaveBeenCalledTimes(1);
    expect(writeToken).toHaveBeenCalledWith('user@example.com', 'token-from-env');
    expect(removeToken).not.toHaveBeenCalled();
  });

  it('prefers direct token environment variables when present', async () => {
    delete process.env.EMAIL;
    delete process.env.PASSWORD;
    process.env.MONEYLOVER_TOKEN = 'env-token';

    const readToken = vi.fn();
    const writeToken = vi.fn();
    const removeToken = vi.fn();
    const constructedTokens = [];

    class MockClient {
      constructor(token) {
        constructedTokens.push(token);
        this.token = token;
      }

      getWallets() {
        return ['wallet'];
      }

      static getToken = vi.fn();
    }

    class MockError extends Error {}

    vi.doMock('../src/moneyloverClient.js', () => ({
      MoneyloverClient: MockClient,
      MoneyloverApiError: MockError
    }));

    vi.doMock('../src/tokenCache.js', () => ({
      readToken,
      writeToken,
      removeToken
    }));

    const { __test } = await import('../src/server.js');
    __test.clearEnvTokenCache();

    const result = await __test.runWithClient(undefined, client => client.getWallets());

    expect(result).toEqual(['wallet']);
    expect(constructedTokens).toEqual(['env-token']);
    expect(MockClient.getToken).not.toHaveBeenCalled();
    expect(readToken).not.toHaveBeenCalled();
    expect(writeToken).not.toHaveBeenCalled();
    expect(removeToken).not.toHaveBeenCalled();
  });

  it('treats empty token argument as missing and falls back to env credentials', async () => {
    process.env.EMAIL = 'user@example.com';
    process.env.PASSWORD = 'secret';

    const getToken = vi.fn().mockResolvedValue('token-from-env');
    const readToken = vi.fn().mockResolvedValue(null);
    const writeToken = vi.fn().mockResolvedValue();
    const removeToken = vi.fn().mockResolvedValue();

    vi.doMock('../src/moneyloverClient.js', () => ({
      MoneyloverClient: class {
        static getToken = getToken;
      },
      MoneyloverApiError: class extends Error {}
    }));

    vi.doMock('../src/tokenCache.js', () => ({
      readToken,
      writeToken,
      removeToken
    }));

    const { __test } = await import('../src/server.js');
    __test.clearEnvTokenCache();

    const resolved = await __test.runWithResolvedToken('', token => Promise.resolve(token));

    expect(resolved).toBe('token-from-env');
    expect(getToken).toHaveBeenCalledWith('user@example.com', 'secret');
    expect(readToken).toHaveBeenCalledWith('user@example.com');
    expect(writeToken).toHaveBeenCalledWith('user@example.com', 'token-from-env');
    expect(removeToken).not.toHaveBeenCalled();
  });

  it('loads credentials from configured env file when missing from process env', async () => {
    delete process.env.EMAIL;
    delete process.env.PASSWORD;
    delete process.env.MONEYLOVER_TOKEN;
    delete process.env.MONEY_LOVER_TOKEN;
    delete process.env.MONEYLOVER_MCP_DISABLE_ENV_FILE;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moneylover-mcp-'));
    const envFilePath = path.join(tmpDir, '.env');
    await fs.writeFile(envFilePath, 'EMAIL=file@example.com\nPASSWORD=file-pass\n');
    process.env.MONEYLOVER_MCP_ENV_FILE = envFilePath;

    const getToken = vi.fn().mockResolvedValue('env-file-token');
    const constructedTokens = [];
    const readToken = vi.fn().mockResolvedValue(null);
    const writeToken = vi.fn().mockResolvedValue();
    const removeToken = vi.fn().mockResolvedValue();

    class MockClient {
      constructor(token) {
        constructedTokens.push(token);
        this.token = token;
      }

      getUserInfo() {
        return { token: this.token };
      }

      static getToken = getToken;
    }

    class MockError extends Error {}

    vi.doMock('../src/moneyloverClient.js', () => ({
      MoneyloverClient: MockClient,
      MoneyloverApiError: MockError
    }));

    vi.doMock('../src/tokenCache.js', () => ({
      readToken,
      writeToken,
      removeToken
    }));

    try {
      const { __test } = await import('../src/server.js');
      __test.clearEnvTokenCache();

      const result = await __test.runWithClient(undefined, client => client.getUserInfo());

      expect(result).toEqual({ token: 'env-file-token' });
      expect(getToken).toHaveBeenCalledWith('file@example.com', 'file-pass');
      expect(writeToken).toHaveBeenCalledWith('file@example.com', 'env-file-token');
      expect(readToken).toHaveBeenCalledWith('file@example.com');
      expect(removeToken).not.toHaveBeenCalled();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('reuses cached token when available', async () => {
    process.env.EMAIL = 'user@example.com';
    process.env.PASSWORD = 'secret';

    const readToken = vi.fn().mockResolvedValue('cached-token');
    const writeToken = vi.fn().mockResolvedValue();
    const removeToken = vi.fn().mockResolvedValue();
    const constructedTokens = [];

    class MockClient {
      constructor(token) {
        constructedTokens.push(token);
        this.token = token;
      }

      getUserInfo() {
        return { via: this.token };
      }

      static getToken = vi.fn();
    }

    class MockError extends Error {}

    vi.doMock('../src/moneyloverClient.js', () => ({
      MoneyloverClient: MockClient,
      MoneyloverApiError: MockError
    }));

    vi.doMock('../src/tokenCache.js', () => ({
      readToken,
      writeToken,
      removeToken
    }));

    const { __test } = await import('../src/server.js');
    __test.clearEnvTokenCache();

    const result = await __test.runWithClient(undefined, client => client.getUserInfo());

    expect(result).toEqual({ via: 'cached-token' });
    expect(readToken).toHaveBeenCalledTimes(1);
    expect(MockClient.getToken).not.toHaveBeenCalled();
    expect(writeToken).not.toHaveBeenCalled();
    expect(constructedTokens).toEqual(['cached-token']);
  });

  it('refreshes env token when API returns an authentication error', async () => {
    process.env.EMAIL = 'user@example.com';
    process.env.PASSWORD = 'secret';

    const getToken = vi.fn().mockResolvedValue('refreshed-token');

    let callCount = 0;

    class MockError extends Error {
      constructor(message, { code } = {}) {
        super(message);
        this.code = code;
      }
    }

    class MockClient {
      constructor(token) {
        this.token = token;
      }

      getWallets() {
        callCount += 1;
        if (callCount === 1) {
          throw new MockError('user_unauthenticated', { code: 1 });
        }
        return { token: this.token };
      }

      static getToken = getToken;
    }

    vi.doMock('../src/moneyloverClient.js', () => ({
      MoneyloverClient: MockClient,
      MoneyloverApiError: MockError
    }));

    const readToken = vi.fn().mockResolvedValueOnce('expired-cached-token').mockResolvedValue(null);
    const writeToken = vi.fn().mockResolvedValue();
    const removeToken = vi.fn().mockResolvedValue();

    vi.doMock('../src/tokenCache.js', () => ({
      readToken,
      writeToken,
      removeToken
    }));

    const { __test } = await import('../src/server.js');
    __test.clearEnvTokenCache();

    const result = await __test.runWithClient(undefined, client => client.getWallets());

    expect(result).toEqual({ token: 'refreshed-token' });
    expect(callCount).toBe(2);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(readToken).toHaveBeenCalledTimes(2);
    expect(removeToken).toHaveBeenCalledWith('user@example.com');
    expect(writeToken).toHaveBeenCalledWith('user@example.com', 'refreshed-token');
  });
});
