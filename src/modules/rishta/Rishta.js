const mongoose = require('mongoose');
const RishtaSchema = new mongoose.Schema({
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gender:    { type: String, enum: ['male','female'], required: true },
  age:       { type: Number, required: true, min: 18, max: 60 },
  city:      { type: String, required: true, maxlength: 100 }, // city only, no coordinates (Req 9)
  education: { type: String, maxlength: 100 },
  profession:{ type: String, maxlength: 100 },
  about:     {
    type: String, maxlength: 500,
    validate: {
      validator: v => !/(\+?\d[\s\-]?){8,}/.test(v) && !/\S+@\S+\.\S+/.test(v),
      message: 'No contact info in description'
    }
  },
  contact_for_admin: { type: String, select: false }, // never returned publicly
  consent_given:    { type: Boolean, required: true, default: false },
  consent_given_at: { type: Date },
  active:   { type: Boolean, default: true },
  verified: { type: Boolean, default: false },
  deleted:  { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

RishtaSchema.pre('save', function(next) {
  if (this.isNew && !this.consent_given)
    return next(new Error('CONSENT_REQUIRED'));
  if (this.isNew) this.consent_given_at = new Date();
  next();
});

RishtaSchema.index({ gender: 1, city: 1, active: 1, deleted: 1 });
module.exports = mongoose.model('Rishta', RishtaSchema);
