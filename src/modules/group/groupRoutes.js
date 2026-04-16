// group/groupRoutes.js
const router = require('express').Router();
const mongoose = require('mongoose');
const { authenticate, requireConsent, requireApproval } = require('../../middleware/auth');

const GroupSchema = new mongoose.Schema({
  name:       { type: String, required: true, maxlength: 100 },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  locked:     { type: Boolean, default: false }, // only admins can send
  muted:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deleted:    { type: Boolean, default: false }
}, { timestamps: true });
const Group = mongoose.model('Group', GroupSchema);

router.use(authenticate, requireApproval, requireConsent);

router.post('/', async (req, res) => {
  try {
    const { name, member_ids = [] } = req.body;
    const g = await Group.create({
      name, created_by: req.user._id,
      members: [req.user._id, ...member_ids],
      admins:  [req.user._id]
    });
    res.status(201).json({ success: true, group: g });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/add', async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const isAdmin = g.admins.some(a => String(a) === String(req.user._id));
  if (!isAdmin) return res.status(403).json({ error: 'Only group admins can add members' });
  g.members.push(...(req.body.member_ids || []));
  await g.save();
  res.json({ success: true });
});

router.post('/:id/exit', async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  g.members = g.members.filter(m => String(m) !== String(req.user._id));
  g.admins  = g.admins.filter(a => String(a) !== String(req.user._id));
  await g.save();
  res.json({ success: true, message: 'Left group' });
});

router.post('/:id/lock', async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const isAdmin = g.admins.some(a => String(a) === String(req.user._id));
  if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
  g.locked = !g.locked;
  await g.save();
  res.json({ success: true, locked: g.locked });
});

router.delete('/:id/messages', async (req, res) => {
  const g = await Group.findById(req.params.id);
  const isAdmin = g?.admins.some(a => String(a) === String(req.user._id));
  if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { Message } = require('../chat/Message');
  await Message.updateMany({ group_id: req.params.id }, { deleted: true, deleted_at: new Date() });
  res.json({ success: true, message: 'Chat cleared' });
});

router.get('/:id/members', async (req, res) => {
  const g = await Group.findById(req.params.id).populate('members', 'name city role isAdmin online');
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({ members: g.members, admins: g.admins, locked: g.locked });
});

module.exports = router;
