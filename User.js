const mongoose = require('mongoose');

// BUG FIX: otp must be a proper nested schema object, not inline types
const OTPSchema = new mongoose.Schema({
  code:      { type: String },
  expiresAt: { type: Date }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  phone:      { type: String, required: true, unique: true, trim: true },
  username:   { type: String, default: '', trim: true, lowercase: true },
  profilePic: { type: String, default: '' },
  bio:        { type: String, default: '', maxlength: 200 },
  city:       { type: String, default: '' },
  role:       { type: String, enum: ['member', 'admin'], default: 'member' },
  status:     { type: String, enum: ['approved', 'pending', 'blocked'], default: 'pending' },
  online:     { type: Boolean, default: false },
  lastSeen:   { type: Date, default: Date.now },
  socketId:   { type: String, default: '' },
  fcmToken:   { type: String, default: '' },
  otp:        { type: OTPSchema, default: null }
}, { timestamps: true });

// Indexes for fast queries
UserSchema.index({ phone: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ online: 1 });

module.exports = mongoose.model('User', UserSchema);
