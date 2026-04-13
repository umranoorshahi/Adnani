require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');

const connectDB     = require('./config/db');
const socketHandler = require('./socket/socketHandler');

// Routes
const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const messageRoutes = require('./routes/messages');
const postRoutes    = require('./routes/posts');

// ── Ensure uploads folder exists (BUG FIX 5: use __dirname) ──
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 uploads/ folder created');
}

// ── Connect DB ─────────────────────────────────────────
connectDB();

// ── Create app ─────────────────────────────────────────
const app    = express();
const SERVER = "https://web-production-4f16.up.railway.app";

// ── Socket.IO ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:  '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  pingTimeout:  60000,
  pingInterval: 25000
});

// Make io available in all controllers via req.app.get('io')
app.set('io', io);

// ── Middleware ─────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// ── API Routes ─────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/posts',    postRoutes);

// ── Health & Root ──────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:    '✅ Biradari Server is Running',
    version:   '2.0.0',
    time:      new Date().toISOString(),
    endpoints: {
      auth:     '/api/auth',
      users:    '/api/users',
      messages: '/api/messages',
      posts:    '/api/posts'
    }
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// ── Socket.IO Engine ───────────────────────────────────
socketHandler(io);

// ── 404 Handler ────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ───────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.message);

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(400).json({ success: false, message: `${field} already exists` });
  }
  // Mongoose validation
  if (err.name === 'ValidationError') {
    const msg = Object.values(err.errors).map(e => e.message).join(', ');
    return res.status(400).json({ success: false, message: msg });
  }
  // Multer file size
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large' });
  }

  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   ✅  Biradari Server v2.0 Started       ║
  ║   🌐  Port  : ${PORT}                        ║
  ║   🗄️  DB    : MongoDB Atlas               ║
  ║   🔌  Socket: Socket.IO ready            ║
  ╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});
