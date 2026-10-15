'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function cleanEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || text.length > 120) return '';
  return text;
}

function cleanName(value, max = 80) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length < 1 || text.length > max) return '';
  return text;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = crypto.scryptSync(String(password), salt, 32);
  return crypto.timingSafeEqual(actual, expected);
}

function publicAccount(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    venue: row.venue,
  };
}

function storePath(env = process.env) {
  if (env.REKONE_ACCOUNTS_FILE) return env.REKONE_ACCOUNTS_FILE;
  if (env.VERCEL) return '/tmp/rekone-accounts.json';
  return path.join(__dirname, '..', 'data', 'rekone-accounts.json');
}

function fileStore(file = storePath()) {
  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data && data.accounts ? data : { accounts: [] };
    } catch (_) {
      return { accounts: [] };
    }
  }
  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  }
  return {
    async getByEmail(email) {
      return read().accounts.find((row) => row.email === cleanEmail(email)) || null;
    },
    async getById(id) {
      return read().accounts.find((row) => row.id === id) || null;
    },
    async update(row) {
      const data = read();
      const index = data.accounts.findIndex((item) => item.id === row.id);
      if (index < 0) throw new Error('missing');
      if (data.accounts.some((item) => item.email === row.email && item.id !== row.id)) {
        const error = new Error('duplicate');
        error.code = '23505';
        throw error;
      }
      data.accounts[index] = row;
      write(data);
    },
    async insert(row) {
      const data = read();
      if (data.accounts.some((item) => item.email === row.email)) {
        const error = new Error('duplicate');
        error.code = '23505';
        throw error;
      }
      data.accounts.push(row);
      write(data);
    },
  };
}

function sqlStore(db) {
  return {
    async getByEmail(email) {
      return db.prepare('SELECT id, email, password_hash, name, venue FROM rekone_accounts WHERE lower(email)=lower(?)').get(cleanEmail(email));
    },
    async getById(id) {
      return db.prepare('SELECT id, email, password_hash, name, venue FROM rekone_accounts WHERE id=?').get(id);
    },
    async update(row) {
      await db.prepare('UPDATE rekone_accounts SET email=?, password_hash=?, name=?, venue=? WHERE id=?')
        .run(row.email, row.password_hash, row.name, row.venue, row.id);
    },
    async insert(row) {
      await db.prepare('INSERT INTO rekone_accounts (id, email, password_hash, name, venue, stripe_session_id) VALUES (?,?,?,?,?,?)')
        .run(row.id, row.email, row.password_hash, row.name, row.venue, row.stripe_session_id);
    },
  };
}

async function register(store, input) {
  const email = cleanEmail(input.email);
  const name = cleanName(input.name);
  const venue = cleanName(input.venue);
  const password = String(input.password || '');
  if (!email) return { error: 'Email invalide', status: 400 };
  if (!name || !venue) return { error: 'Nom et salle requis', status: 400 };
  if (password.length < 8 || password.length > 72) {
    return { error: 'Le mot de passe doit contenir au moins 8 caractères', status: 400 };
  }
  const existing = await store.getByEmail(email);
  if (existing) return { error: 'Cet email a déjà un compte', status: 409, code: 'exists' };
  const row = {
    id: crypto.randomBytes(16).toString('hex'),
    email,
    password_hash: hashPassword(password),
    name,
    venue,
    stripe_session_id: String(input.stripeSessionId || ''),
  };
  try {
    await store.insert(row);
  } catch (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
      return { error: 'Cet email a déjà un compte', status: 409, code: 'exists' };
    }
    throw error;
  }
  return { account: publicAccount(row) };
}

async function updateAccount(store, accountId, input) {
  const current = await store.getById(accountId);
  if (!current) return { error: 'Compte introuvable', status: 404 };
  const email = cleanEmail(input.email || current.email);
  const name = cleanName(input.name || current.name);
  const venue = cleanName(input.venue || current.venue);
  if (!email || !name || !venue) return { error: 'Email, nom et salle requis', status: 400 };
  const nextPassword = String(input.password || '');
  if (nextPassword) {
    if (!verifyPassword(input.currentPassword, current.password_hash)) {
      return { error: 'Mot de passe actuel incorrect', status: 401 };
    }
    if (nextPassword.length < 8 || nextPassword.length > 72) {
      return { error: 'Le mot de passe doit contenir au moins 8 caractères', status: 400 };
    }
  }
  if (email !== current.email) {
    const taken = await store.getByEmail(email);
    if (taken && taken.id !== current.id) return { error: 'Cet email a déjà un compte', status: 409 };
  }
  const row = {
    ...current,
    email,
    name,
    venue,
    password_hash: nextPassword ? hashPassword(nextPassword) : current.password_hash,
  };
  try {
    await store.update(row);
  } catch (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
      return { error: 'Cet email a déjà un compte', status: 409 };
    }
    throw error;
  }
  return { account: publicAccount(row) };
}

async function authenticate(store, input) {
  const email = cleanEmail(input.email);
  const row = email ? await store.getByEmail(email) : null;
  if (!row || !verifyPassword(input.password, row.password_hash)) {
    return { error: 'Email ou mot de passe incorrect', status: 401 };
  }
  return { account: publicAccount(row) };
}

function safeNext(value) {
  const text = String(value || '');
  if (/^\/arcade\/[A-Za-z0-9/?=&._-]{0,180}$/.test(text)) return text;
  return '/arcade/dashboard/';
}

module.exports = {
  cleanEmail,
  hashPassword,
  verifyPassword,
  fileStore,
  sqlStore,
  register,
  updateAccount,
  authenticate,
  safeNext,
  publicAccount,
};
