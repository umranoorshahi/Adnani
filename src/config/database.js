const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const MONGO_URL = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/adnani';

async function connectDB() {
  mongoose.connection.on('connected',    () => logger.info('✅ MongoDB connected — AES-256 active'));
  mongoose.connection.on('disconnected', () => logger.warn('⚠️  MongoDB disconnected'));
  mongoose.connection.on('error',        (e) => logger.error('MongoDB error:', e.message));

  await mongoose.connect(MONGO_URL, {
    useNewUrlParser:    true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10
  });
}

module.exports = { connectDB };
