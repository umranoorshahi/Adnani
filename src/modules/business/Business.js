// Business.js
const mongoose = require('mongoose');
const BizSchema = new mongoose.Schema({
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:     { type: String, required: true, maxlength: 150 },
  category: { type: String, required: true, enum: ['Trade','Services','Real Estate','Technology','Food','Education','Healthcare','Other'] },
  description: { type: String, maxlength: 500 },
  city:        { type: String, maxlength: 100 }, // city only, no raw coordinates (Req 9)
  phone:       { type: String, maxlength: 20 },
  // NO: bank details, tax info, full address, national ID
  consent_given:    { type: Boolean, required: true, default: false },
  consent_given_at: { type: Date },
  active:   { type: Boolean, default: true },
  deleted:  { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });
BizSchema.pre('save', function(next) {
  if (this.isNew && !this.consent_given) return next(new Error('CONSENT_REQUIRED'));
  if (this.isNew) this.consent_given_at = new Date();
  next();
});
BizSchema.index({ category: 1, city: 1, active: 1 });
module.exports = mongoose.model('Business', BizSchema);
