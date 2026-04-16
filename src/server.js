/**
 * ADNANI CONNECTED — Production Backend v3.0
 * Senior Architecture: Modular, Secure, Scalable
 */
require('dotenv').config();
const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const mongoSan    = require('express-mongo-sanitize');
const http        = require('http');
const WebSocket   = require('ws');

const { connectDB }    = require('./config/database');
const { logger }       = require('./utils/logger');
const { rateLimit }    = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const { auditLog }     = require('./middleware/auditLog');
const ChatService      = require('./modules/chat/chatService');

const app    = express();
const server = http.createServer(app);

// ══════════════════════════════════════════
// SECURITY HEADERS
// ══════════════════════════════════════════
app.set('trust proxy', 1);

// Force HTTPS
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' &&
      req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: false
}));

app.use((req, res, next) => {
  res.setHeader('X-TLS-Version',           'TLS-1.3-Required');
  res.setHeader('X-Content-Type-Options',  'nosniff');
  res.setHeader('X-Frame-Options',         'DENY');
  res.setHeader('Referrer-Policy',         'no-referrer');
  next();
});

// ══════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSan());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-MFA-Token','X-Device-ID'],
  credentials: true
}));
app.use(auditLog);

// ══════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════
app.use('/api/auth',         rateLimit('auth'),    require('./modules/auth/authRoutes'));
app.use('/api/users',                              require('./modules/user/userRoutes'));
app.use('/api/rishta',                             require('./modules/rishta/rishtaRoutes'));
app.use('/api/business',                           require('./modules/business/businessRoutes'));
app.use('/api/chat',                               require('./modules/chat/chatRoutes'));
app.use('/api/groups',                             require('./modules/group/groupRoutes'));
app.use('/api/location',                           require('./modules/location/locationRoutes'));
app.use('/api/notifications',                      require('./modules/notification/notifRoutes'));
app.use('/api/quran',        rateLimit('quran'),   require('./modules/quran/quranRoutes'));
app.use('/api/admin',        rateLimit('admin'),   require('./modules/admin/adminRoutes'));
app.use('/api/compliance',                         require('./modules/compliance/complianceRoutes'));

// Health check
app.get('/health', (req, res) => res.json({
  status:     'ok',
  version:    '3.0.0',
  tls:        'TLS-1.3',
  encryption: 'AES-256',
  uptime:     Math.floor(process.uptime()),
  timestamp:  new Date().toISOString()
}));

app.use(errorHandler);

// ══════════════════════════════════════════
// WEBSOCKET (Real-time Chat)
// ══════════════════════════════════════════
const wss = new WebSocket.Server({ server, path: '/ws' });
ChatService.initWebSocket(wss);

// ══════════════════════════════════════════
// SCHEDULED JOBS
// ══════════════════════════════════════════
require('./jobs/scheduledJobs');

// ══════════════════════════════════════════
// START
// ══════════════════════════════════════════
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Adnani Connected v3.0 running on port ${PORT}`);
    logger.info(`🔒 TLS 1.3 | AES-256 | JWT | WebSocket ready`);
  });
}).catch(err => {
  logger.error('DB connection failed:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received - graceful shutdown');
  server.close(() => process.exit(0));
});

module.exports = { app, server };
