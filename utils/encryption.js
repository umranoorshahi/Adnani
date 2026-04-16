const crypto = require('crypto');
const KEY = process.env.FIELD_ENCRYPTION_KEY
  ? Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'hex')
  : crypto.scryptSync('adnani-default-key', 'salt-v1', 32);
const IV_LEN = 16;

module.exports.encrypt = (text) => {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LEN);
  const c  = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  return iv.toString('hex') + ':' + c.update(String(text), 'utf8', 'hex') + c.final('hex');
};

module.exports.decrypt = (text) => {
  if (!text || !text.includes(':')) return text;
  try {
    const [ivH, enc] = text.split(':');
    const d = crypto.createDecipheriv('aes-256-cbc', KEY, Buffer.from(ivH, 'hex'));
    return d.update(enc, 'hex', 'utf8') + d.final('utf8');
  } catch { return text; }
};
