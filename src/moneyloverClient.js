const BASE_URL = 'https://web.moneylover.me/api';
const LOGIN_URL = `${BASE_URL}/user/login-url`;
const TOKEN_URL = 'https://oauth.moneylover.me/token';

class MoneyloverApiError extends Error {
  constructor(message, { code, detail } = {}) {
    super(message);
    this.name = 'MoneyloverApiError';
    this.code = code ?? null;
    if (detail) {
      this.detail = detail;
    }
  }
}

const ensureString = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value.trim();
};

const ensureDateString = date => {
  if (!date) {
    throw new Error('date is required');
  }
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) {
      throw new Error('date is invalid');
    }
    return date.toISOString().slice(0, 10);
  }
  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error('date must be in YYYY-MM-DD format');
    }
    return trimmed;
  }
  throw new Error('date must be a Date or YYYY-MM-DD string');
};

const readJson = async response => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${error.message}`);
  }
};

const parseApiPayload = payload => {
  const errorCode = payload?.error ?? payload?.e ?? 0;
  if (errorCode && errorCode !== 0) {
    const message = payload?.msg || payload?.message || 'Money Lover API error';
    throw new MoneyloverApiError(message, { code: errorCode, detail: payload });
  }
  return payload?.data ?? null;
};

export class MoneyloverClient {
  constructor(token) {
    this.token = ensureString(token, 'token');
  }

  static async getToken(email, password) {
    const loginResponse = await fetch(LOGIN_URL, { method: 'POST' });
    if (!loginResponse.ok) {
      throw new Error(`Failed to initiate login: HTTP ${loginResponse.status}`);
    }

    const loginPayload = await readJson(loginResponse);
    const requestToken = loginPayload?.data?.request_token;
    const loginUrl = loginPayload?.data?.login_url;

    if (!requestToken || !loginUrl) {
      throw new Error('Login response missing request_token or login_url');
    }

    let clientParam = '';
    try {
      const parsed = new URL(loginUrl);
      clientParam = parsed.searchParams.get('client') ?? '';
    } catch (error) {
      throw new Error(`Unable to parse login URL: ${error.message}`);
    }

    if (!clientParam) {
      throw new Error('Login URL missing client parameter');
    }

    const form = new URLSearchParams();
    form.set('email', ensureString(email, 'email'));
    form.set('password', ensureString(password, 'password'));

    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requestToken}`,
        Client: clientParam,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to retrieve access token: HTTP ${tokenResponse.status}`);
    }

    const tokenPayload = await readJson(tokenResponse);
    const accessToken = tokenPayload?.access_token;
    if (!accessToken) {
      throw new Error('Access token not present in response');
    }
    return accessToken;
  }

  async getUserInfo() {
    return this.#post('/user/info');
  }

  async getWallets() {
    return this.#post('/wallet/list');
  }

  async getCategories(walletId) {
    const form = new URLSearchParams();
    form.set('walletId', ensureString(walletId, 'walletId'));
    return this.#post('/category/list', {
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  }

  async getTransactions(walletId, startDate, endDate) {
    const payload = {
      walletId: ensureString(walletId, 'walletId'),
      startDate: ensureString(startDate, 'startDate'),
      endDate: ensureString(endDate, 'endDate')
    };
    return this.#post('/transaction/list', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async addTransaction(params) {
    if (!params || typeof params !== 'object') {
      throw new Error('params is required');
    }

    const payload = {
      with: Array.isArray(params.with) ? params.with : [],
      account: ensureString(params.walletId ?? params.WalletID, 'walletId'),
      category: ensureString(params.categoryId ?? params.CategoryID, 'categoryId'),
      amount: ensureString(params.amount ?? params.Amount, 'amount'),
      note: typeof params.note === 'string' ? params.note : params.Note ?? '',
      displayDate: ensureDateString(params.date ?? params.Date)
    };

    return this.#post('/transaction/add', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async #post(path, { body, headers } = {}) {
    const requestHeaders = new Headers({
      Authorization: `AuthJWT ${this.token}`,
      'Cache-Control': 'no-cache, max-age=0, no-store, no-transform, must-revalidate'
    });

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        requestHeaders.set(key, value);
      }
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: requestHeaders,
      body
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Money Lover API request failed: HTTP ${response.status} - ${detail}`);
    }

    const payload = await readJson(response);
    return parseApiPayload(payload);
  }
}

export { MoneyloverApiError };

export const CategoryType = Object.freeze({
  INCOME: 1,
  EXPENSE: 2
});

export default MoneyloverClient;
