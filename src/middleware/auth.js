const jwt      = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const User     = require('../modules/user/User');

const JWT_SECRET = process.env.JWT_SECRET || 'adnani-change-me';

// ── Verify JWT ───────────────────────────────────────
async function authenticate(req, res, next) {
  try {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ error: 'Token required' });

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user    = await User.findById(decoded.userId)
      .select('-password -mfa_secret -otp');

    if (!user || user.deleted)
      return res.status(401).json({ error: 'User not found' });

    // Check session validity
    const session = user.sessions.find(s => s.token_id === decoded.jti);
    if (!session || !session.active)
      return res.status(401).json({ error: 'Session expired. Please login again.' });

    // Update last active
    session.last_active = new Date();
    await user.save();

    req.user = user;
    req.token_id = decoded.jti;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired' });
    if (err.name === 'JsonWebTokenError')
      return res.status(401).json({ error: 'Invalid token' });
    next(err);
  }
}

// ── Require consent ───────────────────────────────────
function requireConsent(req, res, next) {
  if (!req.user?.terms_accepted)
    return res.status(403).json({
      error: 'CONSENT_REQUIRED',
      message: 'Accept Terms & Conditions first.',
      code: 'TC_NOT_ACCEPTED'
    });
  next();
}

// ── Require approved ──────────────────────────────────
function requireApproval(req, res, next) {
  if (!req.user?.approved)
    return res.status(403).json({ error: 'Account pending approval.' });
  next();
}

// ── Require admin ─────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin && req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// ── Require MFA (for destructive ops) ─────────────────
async function requireMFA(req, res, next) {
  if (!req.user?.isAdmin)
    return res.status(403).json({ error: 'Admin required.' });

  const token = req.headers['x-mfa-token'] || req.body.mfa_token;
  if (!token)
    return res.status(403).json({ error: 'MFA_REQUIRED', message: 'X-MFA-Token header required.' });

  if (!req.user.mfa_enabled)
    return res.status(403).json({ error: 'MFA_NOT_SETUP', message: 'Setup MFA first.' });

  const user   = await User.findById(req.user._id).select('+mfa_secret');
  const { decrypt } = require('../utils/encryption');
  const secret = decrypt(user.mfa_secret);

  const valid = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token:    String(token),
    window:   1
  });

  if (!valid)
    return res.status(403).json({ error: 'MFA_INVALID', message: 'Invalid MFA token.' });

  next();
}

// ── Require dual admin approval ───────────────────────
async function requireDualApproval(req, res, next) {
  const approvals = req.body.approvals || [];
  const admins    = await User.find({ isAdmin: true, deleted: false }).select('_id');
  if (admins.length < 2)
    return res.status(400).json({ error: 'Need at least 2 admins for dual approval.' });

  const validApprovals = approvals.filter(a =>
    admins.some(ad => String(ad._id) === String(a.admin_id))
  );

  if (validApprovals.length < 2)
    return res.status(403).json({
      error: 'DUAL_APPROVAL_REQUIRED',
      message: 'Two separate admins must approve this action.',
      required: 2,
      received: validApprovals.length
    });

  next();
}

module.exports = {
  authenticate,
  requireConsent,
  requireApproval,
  requireAdmin,
  requireMFA,
  requireDualApproval
};
