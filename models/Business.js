/**
 * BUSINESS DIRECTORY MODEL
 * Requirement 1: DATA MINIMIZATION — mandatory fields only
 */

const mongoose = require('mongoose');

const BusinessSchema = new mongoose.Schema({
  // ── MANDATORY FIELDS ONLY ──
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Business owner required']
  },
  name: {
    type: String,
    required: [true, 'Business name required'],
    trim: true,
    maxlength: 150
  },
  category: {
    type: String,
    required: [true, 'Category required'],
    enum: ['Trade', 'Services', 'Real Estate', 'Technology',
           'Food & Restaurant', 'Education', 'Healthcare', 'Other']
  },

  // ── OPTIONAL — with strict limits ──
  description: { type: String, maxlength: 500 },
  city:        { type: String, maxlength: 100 },
  phone:       { type: String, maxlength: 20 },

  // ── NO collection of: bank details, tax info, full address, personal ID ──

  // ── CONSENT ──
  consent_given:    { type: Boolean, required: true, default: false },
  consent_given_at: { type: Date },

  // ── MODERATION ──
  active:   { type: Boolean, default: true },
  verified: { type: Boolean, default: false },
  deleted:  { type: Boolean, default: false },
  deleted_at: { type: Date }

}, { timestamps: true });

BusinessSchema.pre('save', function(next) {
  if (this.isNew && !this.consent_given) {
    return next(new Error('CONSENT_REQUIRED: Business listing requires consent.'));
  }
  if (this.isNew) this.consent_given_at = new Date();
  next();
});

BusinessSchema.index({ category: 1, city: 1, active: 1, deleted: 1 });

module.exports = mongoose.model('Business', BusinessSchema);
