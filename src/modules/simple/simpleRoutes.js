const router = require('express').Router();
const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
  phone:       { type: String, required: true, unique: true },
  name:        { type: String, default: '' },
  city:        { type: String, default: '' },
  status:      { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  approved_by: { type: String, default: '' },
  approved_at: { type: Date },
  registered_at:{ type: Date, default: Date.now }
});
const Member = mongoose.models.SimpleMember || mongoose.model('SimpleMember', MemberSchema);

const ADMIN_PHONES = (process.env.ADMIN_PHONES || '9415061063,9839060377,9918717288').split(',');

// Register new member
router.post('/register', async (req, res) => {
  try {
    const { phone, name, city } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const p = String(phone).replace(/\D/g, '');
    let m = await Member.findOne({ phone: p });
    if (m) return res.json({ success: true, status: m.status });
    m = await Member.create({ phone: p, name: name||'', city: city||'' });
    res.json({ success: true, status: 'pending' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Check status by phone
router.get('/status/:phone', async (req, res) => {
  try {
    const p = String(req.params.phone).replace(/\D/g, '');
    const m = await Member.findOne({ phone: p });
    if (!m) return res.json({ status: 'not_found', approved: false });
    res.json({ status: m.status, approved: m.status === 'approved', name: m.name, city: m.city });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get pending list (admin only)
router.get('/pending', async (req, res) => {
  try {
    const adminP = String(req.query.admin_phone||'').replace(/\D/g,'');
    if (!ADMIN_PHONES.includes(adminP)) return res.status(403).json({ error: 'Admin only' });
    const pending = await Member.find({ status: 'pending' }).sort({ registered_at: -1 });
    res.json({ pending });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Approve member (admin only)
router.post('/approve', async (req, res) => {
  try {
    const adminP = String(req.body.admin_phone||'').replace(/\D/g,'');
    const memP   = String(req.body.member_phone||'').replace(/\D/g,'');
    if (!ADMIN_PHONES.includes(adminP)) return res.status(403).json({ error: 'Admin only' });
    if (!memP) return res.status(400).json({ error: 'Member phone required' });
    let m = await Member.findOne({ phone: memP });
    if (!m) m = new Member({ phone: memP });
    m.status = 'approved';
    m.approved_by = adminP;
    m.approved_at = new Date();
    await m.save();
    res.json({ success: true, message: memP + ' approved' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
