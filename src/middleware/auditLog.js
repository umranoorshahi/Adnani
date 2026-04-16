const { logger } = require('../utils/logger');
const AuditLog   = require('../modules/compliance/AuditLog');

function auditLog(req, res, next) {
  const start = Date.now();
  res.on('finish', async () => {
    // Only log significant actions
    const logActions = ['POST','PUT','PATCH','DELETE'];
    const sensitive   = ['/auth/','/admin/','/account/delete','/purge'];
    const isSensitive = sensitive.some(p => req.path.includes(p));

    if (!logActions.includes(req.method) && !isSensitive) return;

    try {
      await AuditLog.create({
        user_id:    req.user?._id,
        phone:      req.user?.phone,
        action:     `${req.method} ${req.path}`,
        ip:         req.ip || req.headers['x-forwarded-for'],
        device:     req.headers['user-agent']?.slice(0, 200),
        status:     res.statusCode,
        duration_ms: Date.now() - start,
        body_keys:  Object.keys(req.body || {}).filter(k =>
          !['password','token','otp','mfa_token'].includes(k)
        )
      });
    } catch (e) {
      logger.warn('Audit log failed:', e.message);
    }
  });
  next();
}

module.exports = { auditLog };
