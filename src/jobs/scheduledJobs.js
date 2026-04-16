/**
 * SCHEDULED JOBS
 * - Execute approved purge jobs
 * - Session cleanup
 * - Log rotation
 */
const cron     = require('node-cron');
const PurgeJob = require('../modules/admin/PurgeJob');
const User     = require('../modules/user/User');
const { Message } = require('../modules/chat/Message');
const Rishta   = require('../modules/rishta/Rishta');
const Business = require('../modules/business/Business');
const AuditLog = require('../modules/compliance/AuditLog');
const { logger } = require('../utils/logger');

// ── Execute approved purge jobs (every minute check) ──
cron.schedule('* * * * *', async () => {
  try {
    const now  = new Date();
    const jobs = await PurgeJob.find({
      status:     'approved',
      execute_at: { $lte: now }
    });

    for (const job of jobs) {
      logger.warn(`PURGE_EXECUTING: job=${job._id}`);
      job.status = 'executing';
      await job.save();

      try {
        // Count before delete (acts as audit record)
        const counts = {
          users:     await User.countDocuments({ deleted: false }),
          messages:  await Message.countDocuments({ deleted: false }),
          rishta:    await Rishta.countDocuments({ deleted: false }),
          businesses: await Business.countDocuments({ deleted: false })
        };

        // Execute cascading purge (non-admins only)
        const [u, m, r, b] = await Promise.all([
          User.updateMany({ isAdmin: { $ne: true } },
            { deleted: true, deleted_at: now, name: '[PURGED]', phone: 'PURGED_' + Date.now(),
              city: null, password: null, sessions: [], consent_log: [] }),
          Message.updateMany({}, { deleted: true, deleted_at: now, text: '[Purged]' }),
          Rishta.updateMany({}, { deleted: true, deleted_at: now }),
          Business.updateMany({}, { deleted: true, deleted_at: now })
        ]);

        job.status  = 'completed';
        job.result  = { counts_before: counts, deleted: {
          users: u.modifiedCount, messages: m.modifiedCount,
          rishta: r.modifiedCount, businesses: b.modifiedCount
        }};
        await job.save();

        await AuditLog.create({
          action:  'PURGE_COMPLETED',
          details: { job_id: job._id, result: job.result }
        });
        logger.warn(`PURGE_COMPLETE: job=${job._id} | ${JSON.stringify(job.result)}`);
      } catch (err) {
        job.status = 'failed';
        job.error  = err.message;
        await job.save();
        logger.error(`PURGE_FAILED: job=${job._id}`, err);
      }
    }
  } catch (e) {
    logger.error('Purge scheduler error:', e.message);
  }
});

// ── Clean expired sessions (daily) ────────────────────
cron.schedule('0 2 * * *', async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await User.updateMany(
      {},
      { $pull: { sessions: { last_active: { $lt: cutoff } } } }
    );
    logger.info('Session cleanup complete');
  } catch (e) {
    logger.error('Session cleanup error:', e.message);
  }
});

// ── Clean old audit logs (90 days) ────────────────────
cron.schedule('0 3 * * 0', async () => {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    logger.info(`Audit log cleanup: ${result.deletedCount} records removed`);
  } catch (e) {
    logger.error('Audit cleanup error:', e.message);
  }
});

logger.info('📅 Scheduled jobs registered: purge executor, session cleanup, audit rotation');
