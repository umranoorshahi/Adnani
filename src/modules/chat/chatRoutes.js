const router  = require('express').Router();
const Message = require('./Message');
const { authenticate, requireConsent, requireApproval } = require('../../middleware/auth');
router.use(authenticate, requireApproval, requireConsent);

router.get('/conversation/:userId', async (req, res) => {
  try {
    const msgs = await Message.find({
      $or: [
        { from: req.user._id, to: req.params.userId },
        { from: req.params.userId, to: req.user._id }
      ],
      deleted: false
    }).sort({ createdAt: 1 }).limit(100);
    res.json({ messages: msgs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { to, text, group_id } = req.body;
    const clean = (text || '').replace(/<[^>]*>/g, '').slice(0, 5000);
    const msg = await Message.create({ from: req.user._id, to, group_id, text: clean });
    res.status(201).json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
