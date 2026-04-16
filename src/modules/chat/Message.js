// Message.js model
const mongoose = require('mongoose');
const MsgSchema = new mongoose.Schema({
  from:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  group_id: { type: String },
  text:     { type: String, maxlength: 5000 },
  media_url:{ type: String },
  media_type:{ type: String },
  read:     { type: Boolean, default: false },
  read_at:  { type: Date },
  deleted:  { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });
MsgSchema.index({ from: 1, to: 1 });
module.exports = mongoose.model('Message', MsgSchema);
