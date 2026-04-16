const crypto = require('crypto');

const RAW_KEY = process.env.FIELD_ENCRYPTION_KEY || '';
const KEY = RAW_KEY.length >= 64
  ? Buffer.from(RAW_KEY.slice(0, 64), 'hex')
  : crypto.scryptSync('adnani-fallback-key', 'adnani-salt-v1', 32);

const IV_LEN = 16;
const ALGO   = 'aes-256-cbc';

function encrypt(text) {
  if (!text) return text;
  try {
    const iv      = crypto.randomBytes(IV_LEN);
    const cipher  = crypto.createCipheriv(ALGO, KEY, iv);
    const enc     = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
  } catch (e) {
    return text;
  }
}

function decrypt(text) {
  if (!text || typeof text !== 'string' || !text.includes(':')) return text;
  try {
    const [ivHex, encHex] = text.split(':');
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final()
    ]).toString('utf8');
  } catch (e) {
    return text;
  }
}

function hashPassword(plain) {
  const bcrypt = require('bcryptjs');
  return bcrypt.hash(plain, 12);
}

function comparePassword(plain, hash) {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(plain, hash);
}

function generateToken(len = 32) {
  return crypto.randomBytes(len).toString('hex');
}

module.exports = { encrypt, decrypt, hashPassword, comparePassword, generateToken };
