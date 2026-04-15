/**
 * USER MODEL
 * Requirement 2: CONSENT LOGGING — no write until terms_accepted = TRUE + timestamp
 * Requirement 4: AES-256 field-level encryption for sensitive fields
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

// AES-256 field encryption helpers (Requirement 4)
const ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY ||
  crypto.scryptSync('adnani-secret-key', 'salt', 32);
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return text;
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  try {
    const [ivHex, encrypted] = text.split(':');
    const iv      = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return text; // return as-is if decryption fails
  }
}

// ─── CONSENT LOG SCHEMA ────────────────────────────────
const ConsentLogSchema = new mongoose.Schema({
  action:     { type: String, required: true }, // 'terms_accepted', 'terms_updated'
  version:    { type: String, default: '1.0' },
  timestamp:  { type: Date,   default: Date.now },
  ip_address: { type: String },
  user_agent: { type: String },
  accepted:   { type: Boolean, required: true }
}, { _id: false });

// ─── OTP SCHEMA ───────────────────────────────────────
const OtpSchema = new mongoose.Schema({
  code:       { type: String },
  expiresAt:  { type: Date },
  attempts:   { type: Number, default: 0 }
}, { _id: false });

// ─── USER SCHEMA ──────────────────────────────────────
const UserSchema = new mongoose.Schema({
  // ── BASIC FIELDS ──
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    unique: true,
    trim: true,
    match: [/^\d{10,15}$/, 'Invalid phone number']
  },
  name:  { type: String, trim: true, maxlength: 100 },
  city:  { type: String, trim: true, maxlength: 100 },
  role:  { type: String, enum: ['admin', 'member', 'pending'], default: 'pending' },

  // ── APPROVAL ──
  approved:   { type: Boolean, default: false },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },

  // ── CONSENT LOGGING (Requirement 2) ──
  // ⚠️  NO data write until terms_accepted = true
  terms_accepted:   { type: Boolean, default: false, required: true },
  terms_accepted_at: { type: Date },
  consent_log:      [ConsentLogSchema],

  // ── PROFILE ──
  profile_photo: { type: String }, // base64 or URL
  bio:           { type: String, maxlength: 300 },
  online:        { type: Boolean, default: false },
  last_seen:     { type: Date },

  // ── OTP ──
  otp: OtpSchema,

  // ── MFA (for admin) ──
  mfa_secret:  { type: String },  // TOTP secret (stored encrypted)
  mfa_enabled: { type: Boolean, default: false },

  // ── ADMIN ──
  isAdmin:   { type: Boolean, default: false },

  // ── SOFT DELETE (Right to Erasure support) ──
  deleted:      { type: Boolean, default: false },
  deleted_at:   { type: Date },
  deletion_reason: { type: String },

  // ── SECURITY ──
  failed_login_attempts: { type: Number, default: 0 },
  locked_until:          { type: Date },

  // ── AUDIT ──
  ip_address_registration: { type: String },
  device_info:             { type: String },

}, {
  timestamps: true, // createdAt, updatedAt
  toJSON:  { virtuals: true },
  toObject: { virtuals: true }
});

// ─── INDEXES ──────────────────────────────────────────
UserSchema.index({ phone: 1 });
UserSchema.index({ deleted: 1, approved: 1 });

// ─── PRE-SAVE HOOK — Require consent before any write ─
UserSchema.pre('save', function(next) {
  // Requirement 2: Block data write if terms not accepted
  // Exception: OTP fields and initial creation are allowed
  const allowedWithoutConsent = ['phone', 'otp', 'terms_accepted',
    'terms_accepted_at', 'consent_log', 'failed_login_attempts', 'locked_until'];

  if (!this.terms_accepted && !this.isNew) {
    // Check if trying to write protected fields
    const modifiedPaths = this.modifiedPaths();
    const restrictedModification = modifiedPaths.some(
      p => !allowedWithoutConsent.includes(p)
    );
    if (restrictedModification) {
      return next(new Error(
        'CONSENT_REQUIRED: User must accept Terms & Conditions before data can be written.'
      ));
    }
  }

  // Encrypt MFA secret if modified
  if (this.isModified('mfa_secret') && this.mfa_secret) {
    this.mfa_secret = encrypt(this.mfa_secret);
  }

  next();
});

// ─── METHODS ──────────────────────────────────────────
UserSchema.methods.acceptTerms = function(ipAddress, userAgent) {
  this.terms_accepted    = true;
  this.terms_accepted_at = new Date();
  this.consent_log.push({
    action:     'terms_accepted',
    version:    '1.0',
    timestamp:  new Date(),
    ip_address: ipAddress,
    user_agent: userAgent,
    accepted:   true
  });
};

UserSchema.methods.getMfaSecret = function() {
  return decrypt(this.mfa_secret);
};

UserSchema.methods.isLocked = function() {
  return this.locked_until && this.locked_until > new Date();
};

// ─── STATICS ──────────────────────────────────────────
UserSchema.statics.findActive = function(filter = {}) {
  return this.find({ ...filter, deleted: false });
};

// ─── VIRTUAL: safe public profile ─────────────────────
UserSchema.virtual('publicProfile').get(function() {
  return {
    id:       this._id,
    name:     this.name,
    city:     this.city,
    role:     this.role,
    approved: this.approved,
    isAdmin:  this.isAdmin,
    online:   this.online,
    last_seen: this.last_seen
  };
});

module.exports = mongoose.model('User', UserSchema);
