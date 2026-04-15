// routes/business.js
const router   = require('express').Router();
const Business = require('../models/Business');
const { authMiddleware, requireConsent, requireApproval } = require('../middleware/auth');
router.use(authMiddleware, requireApproval, requireConsent);

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { deleted: false, active: true };
    if (category) filter.category = category;
    const listings = await Business.find(filter).populate('owner','name city').sort({ createdAt: -1 });
    res.json({ success: true, listings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, category, description, city, phone } = req.body;
    const biz = await Business.create({
      owner: req.user._id, name, category, description, city, phone,
      consent_given: true
    });
    res.status(201).json({ success: true, business: biz });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const biz = await Business.findById(req.params.id);
    if (!biz) return res.status(404).json({ error: 'Not found' });
    if (String(biz.owner) !== String(req.user._id) && !req.user.isAdmin)
      return res.status(403).json({ error: 'Not authorized' });
    biz.deleted = true; biz.deleted_at = new Date();
    await biz.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
