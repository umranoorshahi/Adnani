/**
 * ADMIN ROUTES
 * Requirement 5: ADMIN PURGE — Delete All via MFA-protected endpoint
 * Requirement 6: Right to Erasure support
 */

const router   = require('express').Router();
const speakeasy = require('speakeasy');
const qrcode   = require('qrcode');
const User     = require('../models/User');
const Rishta   = require('../models/Rishta');
const Business = require('../models/Business');
const { Message, Post } = require('../models/ContentModels');
const { authMiddleware, requireAdmin, requireAdminMFA } = require('../middleware/auth');
const winston  = require('winston');

const logger = winston.createLogger({ transports: [new winston.transports.Console()] });

// All admin routes require auth + admin role
router.use(authMiddleware, requireAdmin);

// ─── GET ALL USERS ─────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    let filter = { deleted: false };
    if (status === 'pending')  filter.approved = false;
    if (status === 'approved') filter.approved = true;
    if (status === 'blocked')  filter.deleted  = true;

    const users = await User.find(filter)
      .select('-otp -mfa_secret -consent_log -ip_address_registration')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── APPROVE USER ──────────────────────────────────────
router.post('/users/:id/approve', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { approved: true, approvedBy: req.user._id, approvedAt: new Date(), role: 'member' },
      { new: true }
    ).select('name phone city approved');

    if (!user) return res.status(404).json({ error: 'User not found' });

    logger.info(`ADMIN_APPROVE: ${req.user.phone} approved user ${user.phone}`);
    res.json({ success: true, message: 'User approved', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BLOCK USER ────────────────────────────────────────
router.post('/users/:id/block', async (req, res) => {
  try {
    // Prevent blocking other admins
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.isAdmin) return res.status(403).json({ error: 'Cannot block an admin' });

    target.deleted     = true;
    target.deleted_at  = new Date();
    target.deletion_reason = 'Blocked by admin: ' + req.user.name;
    await target.save();

    logger.info(`ADMIN_BLOCK: ${req.user.phone} blocked user ${target.phone}`);
    res.json({ success: true, message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SETUP MFA for Admin (Requirement 5 pre-req) ──────
router.post('/mfa/setup', async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `AdnaniConnected:${req.user.phone}`,
      length: 32
    });

    // Store encrypted secret temporarily
    req.user.mfa_secret  = secret.base32;
    req.user.mfa_enabled = false; // Not active until verified
    await req.user.save();

    // Generate QR code
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      message: 'Scan QR with Google Authenticator / Authy',
      qr_code:     qrDataUrl,
      manual_key:  secret.base32,
      instructions: 'After scanning, call POST /api/admin/mfa/verify with your 6-digit code to activate MFA.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VERIFY & ACTIVATE MFA ────────────────────────────
router.post('/mfa/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'MFA token required' });

    const user   = await User.findById(req.user._id);
    const secret = user.getMfaSecret();

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token:    String(token),
      window:   1
    });

    if (!verified) return res.status(400).json({ error: 'Invalid token. MFA not activated.' });

    user.mfa_enabled = true;
    await user.save();

    logger.info(`MFA_ACTIVATED: Admin ${user.phone} activated MFA`);
    res.json({ success: true, message: '✅ MFA activated. Purge endpoints now accessible.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// REQUIREMENT 5: ADMIN PURGE — DELETE ALL (MFA-protected)
// ══════════════════════════════════════════════════════
// POST /api/admin/purge/all
// Header: X-MFA-Token: <6-digit TOTP>
// Body: { confirm: "DELETE_ALL_DATA", mfa_token: "123456" }
router.post('/purge/all', requireAdminMFA, async (req, res) => {
  try {
    const { confirm } = req.body;

    // Double confirmation required
    if (confirm !== 'DELETE_ALL_DATA') {
      return res.status(400).json({
        error: 'CONFIRMATION_REQUIRED',
        message: 'Send body: { "confirm": "DELETE_ALL_DATA" } to proceed.',
        warning: '⚠️ THIS WILL PERMANENTLY DELETE ALL USER AND CHAT DATA'
      });
    }

    logger.warn(`🚨 ADMIN_PURGE_ALL: Initiated by admin ${req.user.phone} at ${new Date().toISOString()}`);

    // Execute cascading delete
    const results = await Promise.allSettled([
      // Delete all non-admin users
      User.deleteMany({ isAdmin: { $ne: true } }),
      // Delete all messages
      Message.deleteMany({}),
      // Delete all posts
      Post.deleteMany({}),
      // Delete all rishta listings
      Rishta.deleteMany({}),
      // Delete all business listings
      Business.deleteMany({})
    ]);

    const summary = {
      users:     results[0].value?.deletedCount || 0,
      messages:  results[1].value?.deletedCount || 0,
      posts:     results[2].value?.deletedCount || 0,
      rishta:    results[3].value?.deletedCount || 0,
      businesses: results[4].value?.deletedCount || 0
    };

    logger.warn(`🚨 ADMIN_PURGE_COMPLETE: Deleted ${JSON.stringify(summary)}`);

    res.json({
      success: true,
      message: 'Database purged successfully.',
      purged_by: req.user.phone,
      purged_at: new Date().toISOString(),
      summary
    });

  } catch (err) {
    logger.error('PURGE_ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/purge/user/:id — Delete single user + all data
router.post('/purge/user/:id', requireAdminMFA, async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent deleting self
    if (userId === String(req.user._id)) {
      return res.status(400).json({ error: 'Cannot delete your own account via purge' });
    }

    const result = await performUserErasure(userId, 'Admin purge by ' + req.user.phone);

    logger.warn(`ADMIN_PURGE_USER: ${req.user.phone} deleted user ${userId}`);
    res.json({ success: true, message: 'User and all associated data deleted.', result });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN STATS ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, pendingUsers, totalMessages, totalPosts, totalRishta, totalBiz] =
      await Promise.all([
        User.countDocuments({ deleted: false }),
        User.countDocuments({ deleted: false, approved: false }),
        Message.countDocuments({ deleted: false }),
        Post.countDocuments({ deleted: false }),
        Rishta.countDocuments({ deleted: false }),
        Business.countDocuments({ deleted: false })
      ]);

    res.json({
      success: true,
      stats: { totalUsers, pendingUsers, totalMessages, totalPosts, totalRishta, totalBiz }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE POST (admin content moderation) ───────────
router.delete('/posts/:id', async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { deleted: true, deleted_at: new Date() });
    res.json({ success: true, message: 'Post deleted by admin' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SHARED ERASURE FUNCTION (used by admin + user) ───
async function performUserErasure(userId, reason) {
  const results = await Promise.allSettled([
    User.findByIdAndUpdate(userId, {
      deleted: true, deleted_at: new Date(), deletion_reason: reason,
      // GDPR: anonymize personal data
      name: '[DELETED]', city: '[DELETED]', phone: 'DELETED_' + userId,
      profile_photo: null, bio: null
    }),
    Message.updateMany({ $or: [{ from: userId }, { to: userId }] },
      { deleted: true, deleted_at: new Date(), text: '[Message deleted by user]' }),
    Post.updateMany({ author: userId },
      { deleted: true, deleted_at: new Date() }),
    // Delete comments by user in other posts
    Post.updateMany(
      { 'comments.author': userId },
      { $set: { 'comments.$[elem].deleted': true } },
      { arrayFilters: [{ 'elem.author': userId }] }
    ),
    Rishta.updateMany({ posted_by: userId }, { deleted: true, deleted_at: new Date() }),
    Business.updateMany({ owner: userId }, { deleted: true, deleted_at: new Date() })
  ]);

  return {
    user:       results[0].status,
    messages:   results[1].value?.modifiedCount || 0,
    posts:      results[2].value?.modifiedCount || 0,
    comments:   results[3].value?.modifiedCount || 0,
    rishta:     results[4].value?.modifiedCount || 0,
    businesses: results[5].value?.modifiedCount || 0
  };
}

module.exports = router;
module.exports.performUserErasure = performUserErasure;
