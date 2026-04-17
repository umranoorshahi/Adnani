/**
 * MESSAGES API - Cross-device chat
 * Simple polling-based messaging
 */
const router = require('express').Router();
const mongoose = require('mongoose');

const MsgSchema = new mongoose.Schema({
  from_phone: { type: String, required: true },
  from_name:  { type: String, default: '' },
  to_phone:   { type: String },       // null = group
  group_id:   { type: String },
  text:       { type: String, required: true, maxlength: 2000 },
  read:       { type: Boolean, default: false },
  deleted:    { type: Boolean, default: false }
}, { timestamps: true });

MsgSchema.index({ from_phone: 1, to_phone: 1 });
MsgSchema.index({ group_id: 1 });

const Msg = mongoose.models.SimpleMsg || mongoose.model('SimpleMsg', MsgSchema);

// GET conversation between 2 phones
router.get('/conversation', async (req, res) => {
  try {
    const { phone1, phone2 } = req.query;
    if (!phone1 || !phone2) return res.status(400).json({ error: 'phone1 and phone2 required' });
    const msgs = await Msg.find({
      deleted: false,
      $or: [
        { from_phone: phone1, to_phone: phone2 },
        { from_phone: phone2, to_phone: phone1 }
      ]
    }).sort({ createdAt: 1 }).limit(100);
    res.json({ messages: msgs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET new messages since timestamp (polling)
router.get('/new', async (req, res) => {
  try {
    const { phone, since } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const sinceDate = since ? new Date(Number(since)) : new Date(Date.now() - 60000);
    const msgs = await Msg.find({
      to_phone: phone,
      deleted: false,
      createdAt: { $gt: sinceDate }
    }).sort({ createdAt: 1 }).limit(50);
    res.json({ messages: msgs, timestamp: Date.now() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST send message
router.post('/', async (req, res) => {
  try {
    const { from_phone, from_name, to_phone, group_id, text } = req.body;
    if (!text || !from_phone) return res.status(400).json({ error: 'from_phone and text required' });
    const msg = await Msg.create({
      from_phone: String(from_phone).replace(/\D/g,''),
      from_name: from_name || '',
      to_phone: to_phone ? String(to_phone).replace(/\D/g,'') : null,
      group_id: group_id || null,
      text: text.slice(0, 2000)
    });
    res.json({ success: true, message: msg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Mark as read
router.post('/read', async (req, res) => {
  try {
    const { phone, other_phone } = req.body;
    await Msg.updateMany(
      { from_phone: other_phone, to_phone: phone, read: false },
      { read: true }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
