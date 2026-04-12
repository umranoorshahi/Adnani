const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    console.log('✅ MongoDB Connected:', conn.connection.host);
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
    // Retry after 5 seconds
    console.log('⏳ Retrying in 5s...');
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
