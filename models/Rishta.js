/**
 * RISHTA (MATRIMONIAL) MODEL
 * Requirement 1: DATA MINIMIZATION — only mandatory fields stored
 * No sensitive personal data beyond what is strictly necessary
 */

const mongoose = require('mongoose');

const RishtaSchema = new mongoose.Schema({
  // ── MANDATORY FIELDS ONLY (Data Minimization) ──
  posted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Posted by user is required']
  },

  // Gender — required for matching
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: [true, 'Gender is required']
  },

  // Age range only — not exact DOB (minimization)
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [18, 'Must be 18 or older'],
    max: [60, 'Age must be realistic']
  },

  // City only — not full address (minimization)
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: 100
  },

  // ── OPTIONAL FIELDS ──
  // Education level — not institution name
  education: { type: String, maxlength: 100 },

  // Profession category — not employer details
  profession: { type: String, maxlength: 100 },

  // Brief description — no contact info allowed
  about: {
    type: String,
    maxlength: 500,
    validate: {
      validator: function(v) {
        // Prevent phone numbers / email in about field
        const phoneRegex = /(\+?\d[\s\-]?){8,}/;
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        return !phoneRegex.test(v) && !emailRegex.test(v);
      },
      message: 'Contact information not allowed in description. Contact admin separately.'
    }
  },

  // ── ADMIN-ONLY CONTACT (not exposed to public) ──
  // Contact is only shared via admin — stored encrypted
  contact_for_admin: {
    type: String, // encrypted phone, visible to admin only
    select: false  // never returned in queries by default
  },

  // ── CONSENT & COMPLIANCE ──
  consent_given:    { type: Boolean, required: true, default: false },
  consent_given_at: { type: Date },

  // ── MODERATION ──
  active:     { type: Boolean, default: true },
  verified:   { type: Boolean, default: false },
  reported:   { type: Boolean, default: false },
  report_reason: { type: String },

  // ── SOFT DELETE ──
  deleted:    { type: Boolean, default: false },
  deleted_at: { type: Date }

}, { timestamps: true });

// Data minimization: never return contact_for_admin publicly
RishtaSchema.methods.toPublicJSON = function() {
  const obj = this.toObject();
  delete obj.contact_for_admin;
  delete obj.__v;
  return obj;
};

// Require consent before creating
RishtaSchema.pre('save', function(next) {
  if (this.isNew && !this.consent_given) {
    return next(new Error('CONSENT_REQUIRED: Rishta cannot be created without explicit consent.'));
  }
  if (this.isNew) {
    this.consent_given_at = new Date();
  }
  next();
});

RishtaSchema.index({ gender: 1, city: 1, active: 1, deleted: 1 });

module.exports = mongoose.model('Rishta', RishtaSchema);
