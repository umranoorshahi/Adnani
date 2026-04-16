const rateL = require('express-rate-limit');

const CONFIGS = {
  auth:    { windowMs: 15 * 60 * 1000, max: 10,  message: 'Too many auth attempts. Wait 15 minutes.' },
  admin:   { windowMs: 60 * 60 * 1000, max: 30,  message: 'Admin rate limit exceeded.' },
  quran:   { windowMs:  1 * 60 * 1000, max: 60,  message: 'Quran API rate limit exceeded.' },
  default: { windowMs: 15 * 60 * 1000, max: 200, message: 'Too many requests.' }
};

function rateLimit(type = 'default') {
  const cfg = CONFIGS[type] || CONFIGS.default;
  return rateL({
    windowMs: cfg.windowMs,
    max:      cfg.max,
    message:  { error: cfg.message },
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator: (req) => req.ip + (req.user?._id || '')
  });
}

module.exports = { rateLimit };
