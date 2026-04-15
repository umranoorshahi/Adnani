// routes/users.js
const router = require('express').Router();
const User   = require('../models/User');
const { authMiddleware, requireConsent, requireApproval } = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', requireApproval, async (req, res) => {
  try {
    const users = await User.find({ deleted: false, approved: true })
      .select('name city role isAdmin online last_seen createdAt')
      .sort({ name: 1 });
    res.json({ success: true, users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/pending', requireApproval, async (req, res) => {
  try {
    const pending = await User.find({ deleted: false, approved: false, terms_accepted: true })
      .select('name phone city createdAt').sort({ createdAt: -1 });
    res.json({ success: true, pending });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/approve', requireApproval, async (req, res) => {
  try {
    // Any approved member can approve pending users
    await User.findByIdAndUpdate(req.params.id, {
      approved: true, approvedBy: req.user._id, approvedAt: new Date(), role: 'member'
    });
    res.json({ success: true, message: 'Member approved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
