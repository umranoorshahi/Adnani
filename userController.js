const User = require('../models/User');

// ── GET /api/users ────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 30 } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const query = { status: 'approved', _id: { $ne: req.user._id } };

    // BUG FIX 11: search by name, phone, OR username
    if (search) {
      query.$or = [
        { name:     { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { phone:    search.trim() }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
          .select('name phone username profilePic online lastSeen city bio')
          .sort({ name: 1 })
          .skip(skip)
          .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({ success: true, users, total, page: parseInt(page) });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/users/me/profile ─────────────────────────
const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-otp -fcmToken');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/users/pending ────────────────────────────
const getPending = async (req, res) => {
  try {
    const users = await User.find({ status: 'pending' })
      .select('name phone city createdAt')
      .sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/users/status ─────────────────────────────
const getStatus = async (req, res) => {
  try {
    const ids   = (req.query.ids || '').split(',').filter(Boolean);
    if (!ids.length) return res.json({ success: true, status: {} });

    const users = await User.find({ _id: { $in: ids } }).select('online lastSeen');
    const map   = {};
    users.forEach(u => {
      map[u._id.toString()] = { online: u.online, lastSeen: u.lastSeen };
    });
    res.json({ success: true, status: map });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/users/:id ────────────────────────────────
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name phone username profilePic online lastSeen city bio');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/users/profile ────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { name, bio, city, username, fcmToken } = req.body;
    const update = {};

    if (name)                   update.name     = name.trim();
    if (bio  !== undefined)     update.bio      = bio;
    if (city !== undefined)     update.city     = city;
    if (fcmToken)               update.fcmToken = fcmToken;
    if (req.file)               update.profilePic = `/uploads/${req.file.filename}`;

    if (username) {
      const taken = await User.findOne({ username: username.toLowerCase(), _id: { $ne: req.user._id } });
      if (taken) return res.status(400).json({ success: false, message: 'Username already taken' });
      update.username = username.toLowerCase().trim();
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true })
      .select('-otp -fcmToken');

    res.json({ success: true, user });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/users/:id/approve (admin) ────────────────
const approveUser = async (req, res) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }

    const status = action === 'reject' ? 'blocked' : 'approved';
    const user   = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Notify via socket
    const io = req.app.get('io');
    if (io && user.socketId) {
      io.to(user.socketId).emit('accountStatus', { status });
    }
    // Also try room-based emit
    if (io) {
      io.to(`user_${user._id}`).emit('accountStatus', { status });
    }

    res.json({ success: true, user });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getUsers, getMyProfile, getUser, updateProfile, getPending, approveUser, getStatus };
