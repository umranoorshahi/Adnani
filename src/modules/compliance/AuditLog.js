// models/AuditLog.js
const mongoose = require('mongoose');
const AuditSchema = new mongoose.Schema({
  user_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  phone:     String,
  action:    { type: String, required: true, index: true },
  details:   Object,
  ip:        String,
  device:    String,
  status:    Number,
  duration_ms: Number,
  body_keys: [String]
}, { timestamps: true });
AuditSchema.index({ createdAt: 1 });
AuditSchema.index({ user_id: 1 });
module.exports = mongoose.model('AuditLog', AuditSchema);
