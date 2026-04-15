/**
 * AUTH ROUTES
 * - OTP send/verify
 * - Terms acceptance with consent logging (Requirement 2)
 * - T&C with legal disclaimer (Requirement 3)
 * - Profile setup
 */

const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const User    = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const JWT_SECRET   = process.env.JWT_SECRET   || 'adnani-secret-change-in-production';
const ADMIN_PHONES = ['9415061063', '9839060377'];
const OTP_EXPIRY_MINS = 10;

// ─── TERMS & CONDITIONS TEXT (Requirement 3) ──────────
// Legal disclaimer injected: content NOT admissible as evidence
const TERMS_VERSION = '1.0';
const TERMS_TEXT = {
  version: TERMS_VERSION,
  last_updated: '2025-01-01',
  sections: [
    {
      title: 'User Agreement / صارف کا معاہدہ',
      content: 'By using Adnani Connected, you agree to these terms. This is a private platform for Muslim Halwai Adnani Biradari members only.'
    },
    {
      title: 'Legal Disclaimer — IMPORTANT / قانونی اعلان — اہم',
      // ⚠️ REQUIREMENT 3: Must include this clause
      content: '⚠️ LEGAL DISCLAIMER: Content shared on this app (messages, posts, images, audio, video) is NOT admissible as legal evidence in any court of law, tribunal, or legal proceeding. This platform does not constitute a legal record. / اس ایپ پر شیئر کیا گیا مواد کسی بھی عدالت میں قانونی ثبوت کے طور پر قابل قبول نہیں ہے۔',
      is_legal_disclaimer: true,
      mandatory: true
    },
    {
      title: 'User Responsibility / صارف کی ذمہ داری',
      content: 'You are solely responsible for all content you share. App Admin and Developers bear NO responsibility for user-generated content.'
    },
    {
      title: 'Indian Law Compliance',
      content: 'Use of this app is governed by Indian Information Technology Act, 2000, IT (Intermediary Guidelines) Rules 2021, and applicable Indian laws.'
    },
    {
      title: 'Data Protection',
      content: 'Your data is encrypted with AES-256. We collect only the minimum data necessary. You have the right to delete your account and all associated data at any time.'
    },
    {
      title: 'Admin Indemnity',
      content: 'Group Admin and App Developer are fully indemnified from any legal dispute arising from user-generated content. Content creators bear sole legal liability.'
    }
  ]
};

// ─── GET TERMS (Requirement 3) ─────────────────────────
router.get('/terms', (req, res) => {
  res.json({
    success: true,
    terms: TERMS_TEXT
  });
});

// ─── SEND OTP ──────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    let { phone } = req.body;
    phone = String(phone || '').replace(/\D/g, '');

    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'Valid phone number required' });
    }

    // Generate OTP
    const otp       = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINS * 60 * 1000);

    // Upsert user with OTP (allowed before consent — just OTP field)
    await User.findOneAndUpdate(
      { phone },
      {
        $set:  { 'otp.code': otp, 'otp.expiresAt': expiresAt, 'otp.attempts': 0 },
        $setOnInsert: {
          phone,
          terms_accepted: false,
          role: ADMIN_PHONES.includes(phone) ? 'admin' : 'pending',
          isAdmin: ADMIN_PHONES.includes(phone)
        }
      },
      { upsert: true, new: true }
    );

    // In production: send via SMS gateway (Twilio, MSG91, etc.)
    // For demo: return OTP in response (remove in production!)
    const response = { success: true, message: 'OTP sent successfully' };
    if (process.env.NODE_ENV !== 'production') {
      response.otp = otp; // Remove in production
      response.demo = true;
    }

    res.json(response);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VERIFY OTP ────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = String(phone || '').replace(/\D/g, '');
    otp   = String(otp || '').trim();

    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP required' });
    }

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'User not found. Please send OTP first.' });

    if (user.isLocked()) {
      return res.status(423).json({ error: 'Account locked. Try again later.' });
    }

    // Check OTP
    if (!user.otp || !user.otp.code || !user.otp.expiresAt) {
      return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }
    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ error: 'OTP expired. Request a new one.' });
    }
    if (user.otp.attempts >= 5) {
      user.locked_until = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      return res.status(423).json({ error: 'Too many attempts. Locked for 30 minutes.' });
    }
    if (user.otp.code !== otp) {
      user.otp.attempts = (user.otp.attempts || 0) + 1;
      await User.updateOne({ phone }, { 'otp.attempts': user.otp.attempts });
      return res.status(400).json({
        error: 'Invalid OTP',
        attemptsRemaining: 5 - user.otp.attempts
      });
    }

    // Clear OTP
    await User.updateOne({ phone }, { $unset: { otp: 1 } });

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id:             user._id,
        phone:          user.phone,
        name:           user.name,
        city:           user.city,
        role:           user.role,
        isAdmin:        user.isAdmin,
        approved:       user.approved,
        terms_accepted: user.terms_accepted,
        needsProfile:   !user.name || !user.city
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ACCEPT TERMS (Requirement 2) ─────────────────────
// Must be called before any data write is allowed
router.post('/accept-terms', authMiddleware, async (req, res) => {
  try {
    const { version = '1.0' } = req.body;
    const user = req.user;

    if (user.terms_accepted) {
      return res.json({ success: true, message: 'Terms already accepted', already_accepted: true });
    }

    // Log consent with IP + UA (Requirement 2)
    user.acceptTerms(
      req.ip || req.headers['x-forwarded-for'],
      req.headers['user-agent']
    );

    await user.save();

    res.json({
      success: true,
      message: 'Terms accepted. Consent logged.',
      terms_accepted_at: user.terms_accepted_at,
      consent_log_entry: user.consent_log[user.consent_log.length - 1]
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SAVE PROFILE ──────────────────────────────────────
router.post('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, city, phone } = req.body;
    const user = req.user;

    // Requirement 2: require consent before profile write
    if (!user.terms_accepted) {
      return res.status(403).json({
        error: 'CONSENT_REQUIRED',
        message: 'Accept Terms & Conditions before saving profile.',
        code: 'TC_NOT_ACCEPTED'
      });
    }

    user.name = name?.trim();
    user.city = city?.trim();

    // Auto-approve admins
    if (ADMIN_PHONES.includes(user.phone)) {
      user.approved = true;
      user.isAdmin  = true;
      user.role     = 'admin';
    }

    await user.save();

    res.json({
      success: true,
      user: user.publicProfile,
      approved: user.approved
    });

  } catch (err) {
    res.status(err.message.includes('CONSENT_REQUIRED') ? 403 : 500).json({ error: err.message });
  }
});

// ─── CHECK STATUS ──────────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
  res.json({
    success:        true,
    approved:       req.user.approved,
    terms_accepted: req.user.terms_accepted,
    role:           req.user.role,
    isAdmin:        req.user.isAdmin,
    needsProfile:   !req.user.name || !req.user.city
  });
});

module.exports = router;
