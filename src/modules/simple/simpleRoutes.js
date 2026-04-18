const router = require('express').Router();
const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
  phone:       { type: String, required: true, unique: true },
  name:        { type: String, default: '' },
  fatherName:  { type: String, default: '' },
  city:        { type: String, default: '' },
  address:     { type: String, default: '' },
  tahsil:      { type: String, default: '' },
  district:    { type: String, default: '' },
  pincode:     { type: String, default: '' },
  status:      { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  approved_by: { type: String, default: '' },
  approved_at: { type: Date },
  registered_at:{ type: Date, default: Date.now }
});
const Member = mongoose.models.SimpleMember || mongoose.model('SimpleMember', MemberSchema);
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '9415061063,9839060377,9918717288').split(',');

router.post('/register', async (req, res) => {
  try {
    const { phone, name, fatherName, city, address, tahsil, district, pincode } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const p = String(phone).replace(/\D/g, '');
    let m = await Member.findOne({ phone: p });
    if (m) {
      // Update details if provided
      if (name) m.name = name;
      if (fatherName) m.fatherName = fatherName;
      if (city) m.city = city;
      if (address) m.address = address;
      if (tahsil) m.tahsil = tahsil;
      if (district) m.district = district;
      if (pincode) m.pincode = pincode;
      await m.save();
      return res.json({ success: true, status: m.status });
    }
    m = await Member.create({ phone: p, name: name||'', fatherName: fatherName||'', city: city||'', address: address||'', tahsil: tahsil||'', district: district||'', pincode: pincode||'' });
    res.json({ success: true, status: 'pending' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/status/:phone', async (req, res) => {
  try {
    const p = String(req.params.phone).replace(/\D/g, '');
    const m = await Member.findOne({ phone: p });
    if (!m) return res.json({ status: 'not_found', approved: false });
    res.json({ status: m.status, approved: m.status === 'approved', name: m.name, city: m.city });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/pending', async (req, res) => {
  try {
    const adminP = String(req.query.admin_phone||'').replace(/\D/g,'');
    if (!ADMIN_PHONES.includes(adminP)) return res.status(403).json({ error: 'Admin only' });
    const pending = await Member.find({ status: 'pending' }).sort({ registered_at: -1 });
    res.json({ pending });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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


// DELETE account (soft delete)
router.delete('/delete-account', async (req, res) => {
  try {
    const phone = String(req.body.phone||'').replace(/\D/g,'');
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    await Member.findOneAndUpdate({ phone }, { status: 'deleted', deleted_at: new Date() });
    res.json({ success: true, message: 'Account deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
