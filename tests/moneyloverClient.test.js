import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoneyloverClient, MoneyloverApiError } from '../src/moneyloverClient.js';

const { Response } = globalThis;

if (typeof Response === 'undefined') {
  throw new Error('Fetch Response implementation is required for these tests.');
}

const originalFetch = global.fetch;

describe('MoneyloverClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('retrieves a token via getToken', async () => {
    const firstResponse = new Response(
      JSON.stringify({
        data: {
          request_token: 'req-token',
          login_url: 'https://web.moneylover.me/login?client=abc123'
        },
        error: 0
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

    const secondResponse = new Response(
      JSON.stringify({ access_token: 'jwt-token' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

    global.fetch
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);

    const token = await MoneyloverClient.getToken('user@example.com', 'password');

    expect(token).toBe('jwt-token');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toBe('https://oauth.moneylover.me/token');
  });

  it('throws when API returns an error payload', async () => {
    const response = new Response(
      JSON.stringify({ error: 1, msg: 'user_unauthenticated' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

    global.fetch.mockResolvedValueOnce(response);

    const client = new MoneyloverClient('token-123');
    await expect(client.getUserInfo()).rejects.toBeInstanceOf(MoneyloverApiError);
  });

  it('sends auth headers when calling protected endpoints', async () => {
    global.fetch.mockImplementation(async (_url, options) => {
      expect(options).toBeDefined();
      expect(options.method).toBe('POST');
      expect(options.headers.get('Authorization')).toBe('AuthJWT secure-token');
      return new Response(
        JSON.stringify({ error: 0, data: { email: 'user@example.com' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const client = new MoneyloverClient('secure-token');
    const data = await client.getUserInfo();

    expect(data).toEqual({ email: 'user@example.com' });
  });
});
