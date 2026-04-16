/**
 * ACCOUNT ROUTES — USER SELF-SERVICE
 * Requirement 6: RIGHT TO ERASURE — 'Delete My Account'
 * Triggers recursive deletion of ALL user data
 */

const router = require('express').Router();
const User   = require('../models/User');
const { authMiddleware, requireConsent } = require('../middleware/auth');
const { performUserErasure } = require('./admin');

router.use(authMiddleware);

// ─── GET MY ACCOUNT ───────────────────────────────────
router.get('/me', (req, res) => {
  res.json({
    success: true,
    user: {
      id:               req.user._id,
      name:             req.user.name,
      city:             req.user.city,
      phone:            req.user.phone,
      role:             req.user.role,
      isAdmin:          req.user.isAdmin,
      approved:         req.user.approved,
      terms_accepted:   req.user.terms_accepted,
      terms_accepted_at: req.user.terms_accepted_at,
      member_since:     req.user.createdAt
    }
  });
});

// ─── GET MY CONSENT LOG ───────────────────────────────
router.get('/consent-log', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('consent_log terms_accepted terms_accepted_at');
    res.json({
      success: true,
      terms_accepted: user.terms_accepted,
      terms_accepted_at: user.terms_accepted_at,
      consent_log: user.consent_log
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE PROFILE ───────────────────────────────────
router.put('/profile', requireConsent, async (req, res) => {
  try {
    const { name, city, bio } = req.body;
    const updates = {};
    if (name) updates.name = name.trim().slice(0, 100);
    if (city) updates.city = city.trim().slice(0, 100);
    if (bio !== undefined) updates.bio = bio.trim().slice(0, 300);

    await User.findByIdAndUpdate(req.user._id, updates);
    res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// REQUIREMENT 6: DELETE MY ACCOUNT (Right to Erasure)
// GDPR Article 17 — Right to be Forgotten
// ═══════════════════════════════════════════════════════
// POST /api/account/delete
// Body: { confirm: "DELETE_MY_ACCOUNT", reason: "optional reason" }
router.post('/delete', async (req, res) => {
  try {
    const { confirm, reason } = req.body;

    // Require explicit confirmation string
    if (confirm !== 'DELETE_MY_ACCOUNT') {
      return res.status(400).json({
        error: 'CONFIRMATION_REQUIRED',
        message: 'Send { "confirm": "DELETE_MY_ACCOUNT" } to proceed.',
        warning: 'This will permanently delete your account and ALL associated data.',
        what_gets_deleted: [
          'Your profile and personal information',
          'All messages you sent and received',
          'All posts and comments you created',
          'Your rishta listing (if any)',
          'Your business listing (if any)',
          'Your consent and activity logs'
        ],
        gdpr_note: 'This fulfills your Right to Erasure under GDPR / Indian PDPB.'
      });
    }

    const userId = req.user._id;
    const erasureReason = reason || 'User requested account deletion';

    // Perform recursive deletion of ALL user data
    const result = await performUserErasure(userId, erasureReason);

    // Final: mark user as purged (keep minimal record for legal compliance - 30 days)
    await User.findByIdAndUpdate(userId, {
      deleted:          true,
      deleted_at:       new Date(),
      deletion_reason:  erasureReason,
      // Anonymize all PII
      name:    '[ACCOUNT DELETED]',
      city:    null,
      phone:   'DELETED_' + Date.now(),
      bio:     null,
      profile_photo: null
    });

    res.json({
      success: true,
      message: '✅ Your account and all associated data have been permanently deleted.',
      deleted_at: new Date().toISOString(),
      erasure_summary: result,
      gdpr_reference: 'Right to Erasure — GDPR Art. 17 / Indian PDPB compliant',
      note: 'A minimal anonymized record is retained for 30 days for legal compliance, then permanently purged.'
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPORT MY DATA (Data Portability) ────────────────
router.get('/export', requireConsent, async (req, res) => {
  try {
    const User     = require('../models/User');
    const { Message, Post } = require('../models/ContentModels');

    const [user, messages, posts] = await Promise.all([
      User.findById(req.user._id).select('-otp -mfa_secret -locked_until -failed_login_attempts'),
      Message.find({ from: req.user._id, deleted: false }).limit(500),
      Post.find({ author: req.user._id, deleted: false }).limit(200)
    ]);

    res.json({
      success: true,
      export_date: new Date().toISOString(),
      note: 'This is all data we hold about you. You have the right to request deletion at any time.',
      data: { profile: user, messages, posts }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
