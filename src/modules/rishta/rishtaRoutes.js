const router = require('express').Router();
const Rishta = require('./Rishta');
const { authenticate, requireConsent, requireApproval } = require('../../middleware/auth');
router.use(authenticate, requireApproval, requireConsent);

router.get('/', async (req, res) => {
  try {
    const { gender, city, page = 1 } = req.query;
    const filter = { deleted: false, active: true };
    if (gender) filter.gender = gender;
    if (city)   filter.city   = new RegExp(city, 'i');
    const list = await Rishta.find(filter)
      .select('-contact_for_admin -__v')
      .sort({ createdAt: -1 }).limit(20).skip((page-1)*20);
    res.json({ listings: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { gender, age, city, education, profession, about, contact } = req.body;
    const r = await Rishta.create({
      posted_by: req.user._id, gender, age, city,
      education, profession, about,
      contact_for_admin: contact,
      consent_given: true
    });
    res.status(201).json({ success: true, id: r._id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await Rishta.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (String(r.posted_by) !== String(req.user._id) && !req.user.isAdmin)
      return res.status(403).json({ error: 'Not authorized' });
    r.deleted = true; r.deleted_at = new Date();
    await r.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
