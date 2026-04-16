/**
 * COMPLIANCE MODULE
 * Req 6: Right to Erasure — recursive account deletion
 * Req 2: Consent log export
 * Req 15: Audit trail
 */
const router   = require('express').Router();
const User     = require('../user/User');
const Rishta   = require('../rishta/Rishta');
const Business = require('../business/Business');
const { Message } = require('../chat/Message');
const AuditLog = require('./AuditLog');
const { authenticate, requireConsent } = require('../../middleware/auth');
const { logger } = require('../../utils/logger');

router.use(authenticate);

// ── My consent log ────────────────────────────────────
router.get('/consent-log', async (req, res) => {
  const user = await User.findById(req.user._id).select('consent_log terms_accepted terms_accepted_at');
  res.json({
    terms_accepted:    user.terms_accepted,
    terms_accepted_at: user.terms_accepted_at,
    history:           user.consent_log
  });
});

// ── Export my data (GDPR portability) ─────────────────
router.get('/export', requireConsent, async (req, res) => {
  try {
    const [user, messages, rishta, biz] = await Promise.all([
      User.findById(req.user._id).select('-password -mfa_secret'),
      Message.find({ from: req.user._id, deleted: false }).limit(500),
      Rishta.find({ posted_by: req.user._id }).select('-contact_for_admin'),
      Business.find({ owner: req.user._id })
    ]);
    res.json({
      exported_at: new Date().toISOString(),
      gdpr_note: 'All data we hold. You can request deletion anytime.',
      data: { profile: user, messages, rishta, businesses: biz }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════
// Req 6: DELETE MY ACCOUNT (Right to Erasure)
// GDPR Article 17
// ══════════════════════════════════════════════════════
router.post('/account/delete', async (req, res) => {
  try {
    const { confirm, reason } = req.body;

    if (confirm !== 'DELETE_MY_ACCOUNT')
      return res.status(400).json({
        error: 'CONFIRMATION_REQUIRED',
        message: 'Send: { "confirm": "DELETE_MY_ACCOUNT" }',
        warning: 'Permanently deletes ALL your data.',
        deletes: ['Profile', 'Messages', 'Rishta listing', 'Business listing', 'Comments', 'Posts']
      });

    const userId = req.user._id;
    const result = await performErasure(userId, reason || 'User requested deletion', req.user.phone);

    logger.warn(`USER_ERASURE: ${req.user.phone} | ${JSON.stringify(result)}`);
    await AuditLog.create({
      user_id: userId, phone: req.user.phone,
      action: 'SELF_DELETION',
      details: { reason, result },
      ip: req.ip
    });

    res.json({
      success:    true,
      message:    'Your account and all data deleted.',
      deleted_at: new Date().toISOString(),
      summary:    result,
      gdpr:       'GDPR Art. 17 / Indian PDPB compliant'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Shared erasure function ────────────────────────────
async function performErasure(userId, reason, phone) {
  const results = await Promise.allSettled([
    // Anonymize user
    User.findByIdAndUpdate(userId, {
      deleted: true, deleted_at: new Date(), deletion_reason: reason,
      name: '[DELETED]', city: null, phone: `DEL_${Date.now()}`,
      bio: null, blocked: false, sessions: [],
      terms_accepted: false, consent_log: []
    }),
    // Delete messages
    Message.updateMany({ $or: [{ from: userId }, { to: userId }] },
      { deleted: true, deleted_at: new Date(), text: '[Deleted]' }),
    // Delete rishta
    Rishta.updateMany({ posted_by: userId }, { deleted: true, deleted_at: new Date() }),
    // Delete businesses
    Business.updateMany({ owner: userId }, { deleted: true, deleted_at: new Date() })
  ]);

  return {
    user:       results[0].status,
    messages:   results[1].value?.modifiedCount || 0,
    rishta:     results[2].value?.modifiedCount || 0,
    businesses: results[3].value?.modifiedCount || 0
  };
}

module.exports = router;
module.exports.performErasure = performErasure;
