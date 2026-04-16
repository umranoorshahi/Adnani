/**
 * ADMIN MODULE
 * - MFA required for destructive ops
 * - Dual admin approval
 * - Delayed execution with backup
 * - Full audit trail
 * Req 5: Secure "Delete All Data"
 */
const router   = require('express').Router();
const User     = require('../user/User');
const Rishta   = require('../rishta/Rishta');
const Business = require('../business/Business');
const { Message } = require('../chat/Message');
const AuditLog = require('../compliance/AuditLog');
const PurgeJob = require('./PurgeJob');
const { authenticate, requireAdmin, requireMFA, requireDualApproval } = require('../../middleware/auth');
const { logger } = require('../../utils/logger');

router.use(authenticate, requireAdmin);

// ── Stats ────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [total, pending, admins, messages, rishta, biz, purgeJobs] = await Promise.all([
      User.countDocuments({ deleted: false }),
      User.countDocuments({ deleted: false, approved: false }),
      User.countDocuments({ isAdmin: true, deleted: false }),
      Message.countDocuments({ deleted: false }),
      Rishta.countDocuments({ deleted: false }),
      Business.countDocuments({ deleted: false }),
      PurgeJob.countDocuments({ status: 'pending' })
    ]);
    res.json({ total_users: total, pending, admins, messages, rishta, businesses: biz, pending_purges: purgeJobs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Users ────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { status = 'all', page = 1, limit = 50 } = req.query;
  const filter = { deleted: false };
  if (status === 'pending')  filter.approved = false;
  if (status === 'approved') filter.approved = true;
  if (status === 'blocked')  filter.blocked  = true;
  const users = await User.find(filter)
    .select('-password -mfa_secret -sessions')
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));
  res.json({ users });
});

router.post('/users/:id/approve', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id,
      { approved: true, approved_by: req.user._id, approved_at: new Date(), role: 'member' },
      { new: true }
    ).select('name phone approved');
    if (!user) return res.status(404).json({ error: 'User not found' });
    logger.info(`ADMIN_APPROVE: ${req.user.phone} approved ${user.phone}`);
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/block', async (req, res) => {
  try {
    const { reason } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Not found' });
    if (target.isAdmin) return res.status(403).json({ error: 'Cannot block admin' });
    target.blocked = true;
    target.blocked_reason = reason || 'Blocked by admin';
    await target.save();
    logger.warn(`ADMIN_BLOCK: ${req.user.phone} blocked ${target.phone}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MFA Setup for Admin ────────────────────────────────
router.post('/mfa/setup', async (req, res) => {
  const speakeasy = require('speakeasy');
  const qrcode    = require('qrcode');
  const { encrypt } = require('../../utils/encryption');
  const secret = speakeasy.generateSecret({ name: `Adnani:${req.user.phone}`, length: 32 });
  const user   = await User.findById(req.user._id).select('+mfa_secret');
  user.mfa_secret  = encrypt(secret.base32);
  user.mfa_enabled = false;
  await user.save();
  const qr = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ qr_code: qr, manual_key: secret.base32 });
});

router.post('/mfa/activate', async (req, res) => {
  const speakeasy = require('speakeasy');
  const { decrypt } = require('../../utils/encryption');
  const { token } = req.body;
  const user    = await User.findById(req.user._id).select('+mfa_secret');
  const valid   = speakeasy.totp.verify({
    secret: decrypt(user.mfa_secret), encoding: 'base32',
    token: String(token), window: 1
  });
  if (!valid) return res.status(400).json({ error: 'Invalid code' });
  user.mfa_enabled = true;
  await user.save();
  res.json({ success: true, message: 'MFA activated. Purge endpoints unlocked.' });
});

// ══════════════════════════════════════════════════════════
// REQUIREMENT 5: PURGE ALL DATA
// Protection layers:
//  1. Admin role check
//  2. MFA token (X-MFA-Token header)
//  3. Dual admin approval
//  4. Delayed execution (30 min default)
//  5. Backup before deletion
//  6. Full audit log
// ══════════════════════════════════════════════════════════

/**
 * STEP 1: Request purge (creates pending job)
 * POST /api/admin/purge/request
 * Body: { reason, second_admin_id, second_admin_mfa }
 */
router.post('/purge/request', requireMFA, async (req, res) => {
  try {
    const { reason, delay_minutes = 30 } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason required' });

    const executeAt = new Date(Date.now() + delay_minutes * 60 * 1000);

    const job = await PurgeJob.create({
      requested_by:  req.user._id,
      reason,
      execute_at:    executeAt,
      delay_minutes,
      approvals:     [{ admin_id: req.user._id, approved_at: new Date() }],
      status:        'awaiting_approval'
    });

    logger.warn(`PURGE_REQUESTED: by ${req.user.phone} | job=${job._id} | execAt=${executeAt}`);

    await AuditLog.create({
      user_id: req.user._id, phone: req.user.phone,
      action:  'PURGE_REQUESTED',
      details: { job_id: job._id, reason, execute_at: executeAt },
      ip: req.ip
    });

    res.json({
      success:    true,
      job_id:     job._id,
      execute_at: executeAt,
      message:    `Purge requested. Needs second admin approval. Executes in ${delay_minutes} minutes.`,
      next_step:  'Second admin must call POST /api/admin/purge/approve with job_id'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * STEP 2: Second admin approves
 * POST /api/admin/purge/approve
 */
router.post('/purge/approve', requireMFA, async (req, res) => {
  try {
    const { job_id } = req.body;
    const job = await PurgeJob.findById(job_id);

    if (!job) return res.status(404).json({ error: 'Purge job not found' });
    if (job.status !== 'awaiting_approval')
      return res.status(400).json({ error: 'Job not awaiting approval' });
    if (String(job.requested_by) === String(req.user._id))
      return res.status(403).json({ error: 'Cannot approve own purge request. Need different admin.' });

    job.approvals.push({ admin_id: req.user._id, approved_at: new Date() });
    job.status = 'approved';
    await job.save();

    logger.warn(`PURGE_APPROVED: by ${req.user.phone} | job=${job_id}`);
    await AuditLog.create({
      user_id: req.user._id, phone: req.user.phone,
      action: 'PURGE_APPROVED', details: { job_id }, ip: req.ip
    });

    res.json({
      success:    true,
      execute_at: job.execute_at,
      message:    `Purge approved. Will execute at ${job.execute_at}. Can be cancelled before then.`
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * STEP 3: Cancel purge (any admin, before execution)
 */
router.post('/purge/cancel', requireMFA, async (req, res) => {
  try {
    const { job_id } = req.body;
    const job = await PurgeJob.findById(job_id);
    if (!job || job.status === 'completed')
      return res.status(400).json({ error: 'Cannot cancel: job not found or completed' });

    job.status = 'cancelled';
    job.cancelled_by = req.user._id;
    await job.save();

    logger.info(`PURGE_CANCELLED: by ${req.user.phone} | job=${job_id}`);
    res.json({ success: true, message: 'Purge job cancelled.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET pending purge jobs
 */
router.get('/purge/jobs', async (req, res) => {
  const jobs = await PurgeJob.find({ status: { $in: ['pending','awaiting_approval','approved'] } })
    .populate('requested_by', 'name phone')
    .sort({ createdAt: -1 });
  res.json({ jobs });
});

// ── Audit log ──────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const { page = 1, limit = 50, action } = req.query;
    const filter = action ? { action: new RegExp(action, 'i') } : {};
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
