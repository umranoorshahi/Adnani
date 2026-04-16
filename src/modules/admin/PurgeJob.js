const mongoose = require('mongoose');

const PurgeJobSchema = new mongoose.Schema({
  requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:       { type: String, required: true },
  execute_at:   { type: Date, required: true },
  delay_minutes:{ type: Number, default: 30 },
  approvals: [{
    admin_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approved_at: { type: Date }
  }],
  status:       { type: String, enum: ['awaiting_approval','approved','executing','completed','cancelled','failed'], default: 'awaiting_approval' },
  cancelled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  backup_path:  { type: String },
  result:       { type: Object },
  error:        { type: String }
}, { timestamps: true });

module.exports = mongoose.model('PurgeJob', PurgeJobSchema);
