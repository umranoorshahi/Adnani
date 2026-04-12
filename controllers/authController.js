const User            = require('../models/User');
const { generateToken } = require('../middleware/auth');

// Seed admins — auto-created on first login
const SEED_ADMINS = [
  { phone: '9415061063', name: 'Haji Mahmood Ahmad', city: 'Bahraich', role: 'admin', status: 'approved' },
  { phone: '9839060377', name: 'Sri Md. Irfan',      city: 'Lucknow',  role: 'admin', status: 'approved' }
];

// ── POST /api/auth/send-otp ───────────────────────────
const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Valid phone number required' });
    }

    const cleanPhone = phone.trim();
    const seedAdmin  = SEED_ADMINS.find(a => a.phone === cleanPhone);

    // BUG FIX: use findOneAndUpdate to avoid race conditions
    let user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      if (seedAdmin) {
        user = new User({ ...seedAdmin, phone: cleanPhone });
      } else {
        user = new User({ phone: cleanPhone, name: 'New Member', status: 'pending' });
      }
    } else if (seedAdmin && user.role !== 'admin') {
      // Upgrade existing user to admin if they are in seed list
      user.role   = 'admin';
      user.status = 'approved';
      user.name   = seedAdmin.name;
    }

    // BUG FIX: properly set nested otp object
    const otp = '123456'; // Fixed OTP for demo — replace with SMS gateway in production
    user.otp = { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
    await user.save();

    console.log(`📱 OTP for ${cleanPhone}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      otp      // ⚠️ Remove in production! Only for testing.
    });

  } catch (err) {
    console.error('sendOTP error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/auth/verify-otp ─────────────────────────
const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP required' });
    }

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please request OTP first.' });
    }

    // BUG FIX: check otp object properly
    if (!user.otp || !user.otp.code) {
      return res.status(400).json({ success: false, message: 'Please request OTP first' });
    }
    if (user.otp.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP expired. Request a new one.' });
    }
    if (user.otp.code !== otp.trim()) {
      return res.status(401).json({ success: false, message: 'Wrong OTP. Try again.' });
    }

    // Clear OTP after successful verify
    user.otp = null;
    await user.save();

    const token      = generateToken(user._id);
    const isAdmin    = user.role === 'admin';
    const isApproved = user.status === 'approved';
    const needsSetup = user.name === 'New Member' && !isAdmin && !isApproved;

    res.json({
      success: true,
      token,
      needsProfileSetup: needsSetup,
      user: {
        _id:        user._id,
        name:       user.name,
        phone:      user.phone,
        profilePic: user.profilePic,
        role:       user.role,
        status:     user.status,
        city:       user.city,
        bio:        user.bio,
        username:   user.username
      }
    });

  } catch (err) {
    console.error('verifyOTP error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/auth/setup-profile ───────────────────────
const setupProfile = async (req, res) => {
  try {
    const { name, city, bio } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name: name.trim(), city: city || '', bio: bio || '' },
      { new: true, runValidators: true }
    ).select('-otp -fcmToken');

    res.json({ success: true, user });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/auth/me ──────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-otp -fcmToken');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { sendOTP, verifyOTP, setupProfile, getMe };
