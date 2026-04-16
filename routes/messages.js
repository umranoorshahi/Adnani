// routes/messages.js
const router  = require('express').Router();
const { Message } = require('../models/ContentModels');
const { authMiddleware, requireConsent, requireApproval } = require('../middleware/auth');
router.use(authMiddleware, requireApproval, requireConsent);

router.post('/', async (req, res) => {
  try {
    const { to, text, group_id, media_url, media_type } = req.body;
    const msg = await Message.create({ from: req.user._id, to, text, group_id, media_url, media_type });
    res.status(201).json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/conversation/:userId', async (req, res) => {
  try {
    const msgs = await Message.find({
      $or: [
        { from: req.user._id, to: req.params.userId },
        { from: req.params.userId, to: req.user._id }
      ],
      deleted: false
    }).sort({ createdAt: 1 }).limit(100);
    res.json({ success: true, messages: msgs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
