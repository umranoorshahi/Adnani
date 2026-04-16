// routes/rishta.js — Data minimization + consent enforced
const router  = require('express').Router();
const Rishta  = require('../models/Rishta');
const { authMiddleware, requireConsent, requireApproval } = require('../middleware/auth');
router.use(authMiddleware, requireApproval, requireConsent);

router.get('/', async (req, res) => {
  try {
    const { gender, city } = req.query;
    const filter = { deleted: false, active: true };
    if (gender) filter.gender = gender;
    if (city)   filter.city   = new RegExp(city, 'i');
    const listings = await Rishta.find(filter)
      .select('-contact_for_admin -__v') // Never expose contact to public
      .sort({ createdAt: -1 });
    res.json({ success: true, listings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { gender, age, city, education, profession, about, contact_for_admin } = req.body;
    const listing = await Rishta.create({
      posted_by: req.user._id,
      gender, age: Number(age), city, education, profession, about,
      contact_for_admin, // stored encrypted, admin-only
      consent_given: true
    });
    res.status(201).json({ success: true, listing: listing.toPublicJSON() });
  } catch (e) { res.status(e.message.includes('CONSENT') ? 403 : 400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const listing = await Rishta.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Not found' });
    if (String(listing.posted_by) !== String(req.user._id) && !req.user.isAdmin)
      return res.status(403).json({ error: 'Not authorized' });
    listing.deleted = true; listing.deleted_at = new Date();
    await listing.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
