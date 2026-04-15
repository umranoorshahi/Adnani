/**
 * AUTHENTICATION MIDDLEWARE
 * - JWT verification
 * - Consent guard (Requirement 2)
 * - Admin MFA check (Requirement 5)
 */

const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const speakeasy = require('speakeasy');

const JWT_SECRET = process.env.JWT_SECRET || 'adnani-secret-change-in-production';

// ─── AUTH MIDDLEWARE ──────────────────────────────────
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-otp -mfa_secret');
    if (!user || user.deleted) {
      return res.status(401).json({ error: 'User not found or deleted' });
    }

    if (user.isLocked()) {
      return res.status(423).json({
        error: 'Account temporarily locked due to failed attempts.',
        lockedUntil: user.locked_until
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError')  return res.status(401).json({ error: 'Invalid token' });
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    next(err);
  }
}

// ─── CONSENT GUARD (Requirement 2) ───────────────────
// Blocks any data write if terms not accepted
function requireConsent(req, res, next) {
  if (!req.user.terms_accepted) {
    return res.status(403).json({
      error: 'CONSENT_REQUIRED',
      message: 'You must accept the Terms & Conditions before using this feature.',
      code: 'TC_NOT_ACCEPTED'
    });
  }
  next();
}

// ─── ADMIN MIDDLEWARE ─────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user.isAdmin && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─── ADMIN MFA MIDDLEWARE (Requirement 5) ─────────────
// Required for destructive admin operations (purge, delete-all)
async function requireAdminMFA(req, res, next) {
  if (!req.user.isAdmin && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const mfaToken = req.headers['x-mfa-token'] || req.body.mfa_token;
  if (!mfaToken) {
    return res.status(403).json({
      error: 'MFA_REQUIRED',
      message: 'Multi-Factor Authentication token required for this operation.',
      code: 'MFA_MISSING'
    });
  }

  // Verify TOTP token
  if (!req.user.mfa_enabled) {
    return res.status(403).json({
      error: 'MFA_NOT_SETUP',
      message: 'Admin MFA not configured. Set up MFA before accessing this endpoint.',
      code: 'MFA_NOT_SETUP'
    });
  }

  const secret = req.user.getMfaSecret();
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token:    String(mfaToken),
    window:   1 // Allow 30 second clock drift
  });

  if (!verified) {
    return res.status(403).json({
      error: 'MFA_INVALID',
      message: 'Invalid MFA token. Access denied.',
      code: 'MFA_INVALID'
    });
  }

  next();
}

// ─── APPROVAL GUARD ───────────────────────────────────
function requireApproval(req, res, next) {
  if (!req.user.approved) {
    return res.status(403).json({
      error: 'APPROVAL_PENDING',
      message: 'Your account is awaiting admin approval.',
      code: 'NOT_APPROVED'
    });
  }
  next();
}

module.exports = {
  authMiddleware,
  requireConsent,
  requireAdmin,
  requireAdminMFA,
  requireApproval
};
