const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../../utils/encryption');

// ── Session Schema ─────────────────────────────────────
const SessionSchema = new mongoose.Schema({
  token_id:    { type: String, required: true },
  device_info: { type: String },
  ip:          { type: String },
  created_at:  { type: Date, default: Date.now },
  last_active: { type: Date, default: Date.now },
  active:      { type: Boolean, default: true }
}, { _id: false });

// ── Consent Log Schema ─────────────────────────────────
const ConsentSchema = new mongoose.Schema({
  version:    { type: String, required: true },
  accepted:   { type: Boolean, required: true },
  timestamp:  { type: Date, default: Date.now },
  ip:         { type: String },
  device:     { type: String }
}, { _id: false });

// ── User Schema ────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  // Core identity (minimized)
  phone:    { type: String, required: true, unique: true, trim: true, match: /^\d{10,15}$/ },
  name:     { type: String, trim: true, maxlength: 100 },
  city:     { type: String, trim: true, maxlength: 100 },
  role:     { type: String, enum: ['admin','member','pending'], default: 'pending' },
  isAdmin:  { type: Boolean, default: false },

  // Password auth (Req 7: strong passwords)
  password:      { type: String, select: false },
  password_changed_at: { type: Date },

  // Approval
  approved:    { type: Boolean, default: false },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },

  // Consent logging (Req 2)
  terms_accepted:    { type: Boolean, default: false },
  terms_accepted_at: { type: Date },
  consent_log:       [ConsentSchema],

  // 2FA / MFA (optional, Req 7)
  mfa_secret:  { type: String, select: false },
  mfa_enabled: { type: Boolean, default: false },

  // Sessions (Req 7: track devices)
  sessions: [SessionSchema],

  // Failed login tracking (Req 7: rate limiting)
  failed_logins: { type: Number, default: 0 },
  locked_until:  { type: Date },

  // Right to erasure (Req 6)
  deleted:          { type: Boolean, default: false, index: true },
  deleted_at:       { type: Date },
  deletion_reason:  { type: String },

  // Blocked
  blocked:       { type: Boolean, default: false },
  blocked_reason: { type: String },

  // Profile
  bio:           { type: String, maxlength: 300 },
  online:        { type: Boolean, default: false },
  last_seen:     { type: Date }

}, { timestamps: true });

UserSchema.index({ phone: 1 });
UserSchema.index({ deleted: 1, approved: 1, role: 1 });

// ── Pre-save: enforce consent ──────────────────────────
UserSchema.pre('save', function(next) {
  const safeFields = ['phone','password','terms_accepted','terms_accepted_at',
    'consent_log','failed_logins','locked_until','otp'];
  if (!this.terms_accepted && !this.isNew) {
    const modified = this.modifiedPaths();
    const blocked  = modified.some(p => !safeFields.includes(p.split('.')[0]));
    if (blocked)
      return next(new Error('CONSENT_REQUIRED: Accept Terms before writing data.'));
  }
  next();
});

// ── Methods ────────────────────────────────────────────
UserSchema.methods.acceptTerms = function(ip, device, version = '1.0') {
  this.terms_accepted    = true;
  this.terms_accepted_at = new Date();
  this.consent_log.push({ version, accepted: true, ip, device });
};

UserSchema.methods.isLocked = function() {
  return this.locked_until && this.locked_until > new Date();
};

UserSchema.methods.getMfaSecret = function() {
  return decrypt(this.mfa_secret);
};

UserSchema.methods.toPublic = function() {
  return {
    id:       this._id,
    name:     this.name,
    city:     this.city,
    role:     this.role,
    isAdmin:  this.isAdmin,
    approved: this.approved,
    online:   this.online,
    last_seen: this.last_seen
  };
};

module.exports = mongoose.model('User', UserSchema);
