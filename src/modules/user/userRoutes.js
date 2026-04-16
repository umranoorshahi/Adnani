// user/userRoutes.js
const router = require('express').Router();
const User   = require('./User');
const { authenticate, requireConsent, requireApproval, requireAdmin } = require('../../middleware/auth');
const { hashPassword } = require('../../utils/encryption');

router.use(authenticate);

router.get('/me', (req, res) => res.json({ user: req.user.toPublic() }));

router.put('/profile', requireConsent, async (req, res) => {
  try {
    const { name, city, bio } = req.body;
    const updates = {};
    if (name) updates.name = name.trim().slice(0,100);
    if (city) updates.city = city.trim().slice(0,100);
    if (bio !== undefined) updates.bio = bio.slice(0,300);
    await User.findByIdAndUpdate(req.user._id, updates);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/change-password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const { comparePassword, hashPassword: hp } = require('../../utils/encryption');
    const user = await User.findById(req.user._id).select('+password');
    const valid = await comparePassword(current_password, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
    if (new_password.length < 8) return res.status(400).json({ error: 'Min 8 characters' });
    user.password = await hp(new_password);
    user.password_changed_at = new Date();
    await user.save();
    res.json({ success: true, message: 'Password changed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/', requireApproval, async (req, res) => {
  try {
    const users = await User.find({ deleted: false, approved: true })
      .select('name city role isAdmin online last_seen')
      .sort({ name: 1 });
    res.json({ users });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/pending', requireApproval, async (req, res) => {
  try {
    const pending = await User.find({ deleted: false, approved: false, terms_accepted: true })
      .select('name phone city createdAt').sort({ createdAt: -1 });
    res.json({ pending });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/approve', requireApproval, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id,
      { approved: true, approved_by: req.user._id, approved_at: new Date(), role: 'member' });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
