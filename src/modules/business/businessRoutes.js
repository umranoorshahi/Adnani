const router   = require('express').Router();
const Business = require('./Business');
const { authenticate, requireConsent, requireApproval } = require('../../middleware/auth');
router.use(authenticate, requireApproval, requireConsent);

router.get('/', async (req, res) => {
  try {
    const { category, city } = req.query;
    const filter = { deleted: false, active: true };
    if (category) filter.category = category;
    if (city)     filter.city     = new RegExp(city, 'i');
    const list = await Business.find(filter).populate('owner','name city').sort({ createdAt: -1 }).limit(50);
    res.json({ listings: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, category, description, city, phone } = req.body;
    const b = await Business.create({ owner: req.user._id, name, category, description, city, phone, consent_given: true });
    res.status(201).json({ success: true, id: b._id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const b = await Business.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    if (String(b.owner) !== String(req.user._id) && !req.user.isAdmin)
      return res.status(403).json({ error: 'Not authorized' });
    b.deleted = true; b.deleted_at = new Date(); await b.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
