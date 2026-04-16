// location/locationRoutes.js — city-only, no raw coordinates stored (Req 9)
const router = require('express').Router();
const User   = require('../user/User');
const { authenticate, requireApproval } = require('../../middleware/auth');
router.use(authenticate, requireApproval);

// Get members by city (city-based listing only)
router.get('/city/:city', async (req, res) => {
  try {
    const members = await User.find({
      city: new RegExp(req.params.city, 'i'),
      deleted: false, approved: true
    }).select('name city role isAdmin online').limit(50);
    res.json({ city: req.params.city, members });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get all cities with member counts
router.get('/cities', async (req, res) => {
  try {
    const result = await User.aggregate([
      { $match: { deleted: false, approved: true, city: { $exists: true, $ne: null } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json({ cities: result.map(r => ({ city: r._id, count: r.count })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
