/**
 * AUTH MODULE
 * - Password login (no mandatory OTP)
 * - Optional 2FA
 * - Session/device tracking
 * - Consent enforcement
 */
const router   = require('express').Router();
const jwt      = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode   = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const User     = require('../user/User');
const { hashPassword, comparePassword, encrypt, generateToken } = require('../../utils/encryption');
const { authenticate } = require('../../middleware/auth');
const { logger } = require('../../utils/logger');
const AuditLog = require('../compliance/AuditLog');

const JWT_SECRET  = process.env.JWT_SECRET  || 'adnani-change-me';
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '9415061063,9839060377').split(',');

// ── Terms & Conditions (Req 3: Legal disclaimer) ──────
router.get('/terms', (req, res) => {
  res.json({
    version: '2.0',
    last_updated: '2025-04-16',
    legal_disclaimer: '⚠️ Content on this app is NOT admissible as legal evidence in any court of law, tribunal, or legal proceeding. This platform does not constitute a legal record.',
    sections: [
      { id: 1, title: 'User Agreement',       content: 'Private platform for Adnani Biradari members only.' },
      { id: 2, title: 'User Responsibility',  content: 'You are solely responsible for all content shared.' },
      { id: 3, title: 'Admin Indemnity',      content: 'Admin and Developer bear NO responsibility for user content.' },
      { id: 4, title: 'Indian IT Act 2000',   content: 'Governed by IT Act 2000, PDPB, and applicable Indian law.' },
      { id: 5, title: 'Data Protection',      content: 'AES-256 encrypted. Minimum data collected. Right to erasure available.' },
      { id: 6, title: 'Legal Disclaimer',     content: 'Content NOT admissible as legal evidence.', mandatory: true }
    ]
  });
});

// ── Accept Terms ───────────────────────────────────────
router.post('/accept-terms', authenticate, async (req, res) => {
  try {
    const user = req.user;
    if (user.terms_accepted)
      return res.json({ success: true, message: 'Already accepted', already: true });

    user.acceptTerms(
      req.ip || req.headers['x-forwarded-for'],
      req.headers['user-agent']?.slice(0, 200),
      '2.0'
    );
    await user.save();
    res.json({ success: true, accepted_at: user.terms_accepted_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Register ───────────────────────────────────────────
const registerValidation = [
  body('phone').matches(/^\d{10,15}$/).withMessage('Invalid phone number'),
  body('password').isLength({ min: 8 }).withMessage('Min 8 characters')
    .matches(/[A-Z]/).withMessage('Need uppercase')
    .matches(/[0-9]/).withMessage('Need number')
    .matches(/[!@#$%^&*]/).withMessage('Need special character'),
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('city').trim().isLength({ min: 2, max: 100 })
];

router.post('/register', registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  try {
    const { phone, password, name, city } = req.body;
    const exists = await User.findOne({ phone });
    if (exists)
      return res.status(409).json({ error: 'Phone already registered.' });

    const hashed  = await hashPassword(password);
    const isAdmin = ADMIN_PHONES.includes(phone);

    const user = await User.create({
      phone, name, city,
      password:  hashed,
      isAdmin,
      role:      isAdmin ? 'admin' : 'pending',
      approved:  isAdmin
    });

    logger.info(`REGISTER: ${phone} | admin=${isAdmin}`);
    res.status(201).json({
      success:        true,
      message:        'Registered. Accept Terms to continue.',
      needs_terms:    true,
      needs_approval: !isAdmin,
      user:           user.toPublic()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Login ──────────────────────────────────────────────
router.post('/login', [
  body('phone').matches(/^\d{10,15}$/),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  try {
    const { phone, password, mfa_token } = req.body;
    const user = await User.findOne({ phone, deleted: false }).select('+password +mfa_secret');

    if (!user)
      return res.status(401).json({ error: 'Invalid credentials.' });

    if (user.blocked)
      return res.status(423).json({ error: 'Account blocked. Contact admin.' });

    if (user.isLocked())
      return res.status(423).json({ error: 'Account locked.', until: user.locked_until });

    // Check password
    const valid = await comparePassword(password, user.password || '');
    if (!valid) {
      user.failed_logins = (user.failed_logins || 0) + 1;
      if (user.failed_logins >= 5)
        user.locked_until = new Date(Date.now() + 30 * 60 * 1000);
      await User.updateOne({ _id: user._id }, {
        failed_logins: user.failed_logins,
        locked_until:  user.locked_until
      });
      await AuditLog.create({
        user_id: user._id, phone,
        action: 'LOGIN_FAILED',
        ip: req.ip, device: req.headers['user-agent']?.slice(0,200)
      });
      return res.status(401).json({
        error: 'Invalid credentials.',
        attempts_remaining: Math.max(0, 5 - user.failed_logins)
      });
    }

    // Check MFA if enabled
    if (user.mfa_enabled) {
      if (!mfa_token)
        return res.status(403).json({ error: 'MFA_REQUIRED', message: '2FA code required.' });
      const { decrypt } = require('../../utils/encryption');
      const mfaValid = speakeasy.totp.verify({
        secret: decrypt(user.mfa_secret),
        encoding: 'base32',
        token: String(mfa_token),
        window: 1
      });
      if (!mfaValid)
        return res.status(403).json({ error: 'Invalid 2FA code.' });
    }

    // Reset failed logins
    user.failed_logins = 0;
    user.locked_until  = undefined;

    // Create session
    const tokenId = uuidv4();
    const session = {
      token_id:    tokenId,
      device_info: req.headers['user-agent']?.slice(0, 200),
      ip:          req.ip,
      active:      true
    };

    // Max 5 active sessions
    user.sessions = user.sessions
      .filter(s => s.active)
      .slice(-4);
    user.sessions.push(session);
    user.online   = true;
    user.last_seen = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, phone: user.phone, role: user.role, jti: tokenId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await AuditLog.create({
      user_id: user._id, phone,
      action: 'LOGIN_SUCCESS',
      ip: req.ip, device: req.headers['user-agent']?.slice(0,200)
    });

    res.json({
      success: true,
      token,
      user: {
        ...user.toPublic(),
        terms_accepted: user.terms_accepted,
        needsProfile:   !user.name || !user.city
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Logout ─────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id, 'sessions.token_id': req.token_id },
      { $set: { 'sessions.$.active': false, online: false, last_seen: new Date() } }
    );
    res.json({ success: true, message: 'Logged out.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Logout all devices ──────────────────────────────────
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'sessions.$[].active': false, online: false } }
    );
    res.json({ success: true, message: 'All sessions terminated.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Active sessions ─────────────────────────────────────
router.get('/sessions', authenticate, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    sessions: user.sessions.filter(s => s.active).map(s => ({
      device: s.device_info?.slice(0, 50),
      ip:     s.ip,
      last_active: s.last_active,
      current: s.token_id === req.token_id
    }))
  });
});

// ── Setup 2FA ───────────────────────────────────────────
router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `AdnaniConnected:${req.user.phone}`,
      length: 32
    });
    const user = await User.findById(req.user._id).select('+mfa_secret');
    user.mfa_secret  = encrypt(secret.base32);
    user.mfa_enabled = false;
    await user.save();

    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qr_code: qr, manual_key: secret.base32,
      instructions: 'Scan with Google Authenticator / Authy, then verify.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Verify & activate 2FA ───────────────────────────────
router.post('/2fa/verify', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    const user   = await User.findById(req.user._id).select('+mfa_secret');
    const { decrypt } = require('../../utils/encryption');
    const valid  = speakeasy.totp.verify({
      secret: decrypt(user.mfa_secret), encoding: 'base32',
      token: String(token), window: 1
    });
    if (!valid) return res.status(400).json({ error: 'Invalid code.' });
    user.mfa_enabled = true;
    await user.save();
    res.json({ success: true, message: '2FA enabled.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Status ──────────────────────────────────────────────
router.get('/status', authenticate, (req, res) => {
  res.json({
    approved:       req.user.approved,
    terms_accepted: req.user.terms_accepted,
    role:           req.user.role,
    mfa_enabled:    req.user.mfa_enabled,
    needsProfile:   !req.user.name || !req.user.city
  });
});

module.exports = router;
