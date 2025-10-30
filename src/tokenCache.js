import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = path.join(os.homedir(), '.moneylover-mcp');

const encodeEmail = email => Buffer.from(email, 'utf8').toString('base64url');

const getTokenPath = email => path.join(CACHE_DIR, `${encodeEmail(email)}.json`);

const ensureCacheDir = async () => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

export const readToken = async email => {
  if (!email) {
    return null;
  }
  try {
    const raw = await fs.readFile(getTokenPath(email), 'utf8');
    const data = JSON.parse(raw);
    const token = data?.token;
    return typeof token === 'string' && token ? token : null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const writeToken = async (email, token) => {
  if (!email || !token) {
    return;
  }
  await ensureCacheDir();
  const payload = {
    token,
    updatedAt: new Date().toISOString()
  };
  const filePath = getTokenPath(email);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  try {
    await fs.chmod(filePath, 0o600);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

export const removeToken = async email => {
  if (!email) {
    return;
  }
  try {
    await fs.unlink(getTokenPath(email));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

export const __test = {
  CACHE_DIR,
  getTokenPath,
  ensureCacheDir
};

export default {
  readToken,
  writeToken,
  removeToken
};
