/**
 * POSTS API - Cross-device feed, likes, comments
 * No complex auth - uses phone-based identification
 */
const router = require('express').Router();
const mongoose = require('mongoose');

// Post Schema
const PostSchema = new mongoose.Schema({
  phone:     { type: String, required: true },
  name:      { type: String, default: 'Community' },
  city:      { type: String, default: '' },
  text:      { type: String, required: true, maxlength: 2000 },
  imgs:      [String],
  likes:     { type: Number, default: 0 },
  likedBy:   [String], // phones that liked
  comments:  [{
    id:    { type: String },
    name:  { type: String },
    phone: { type: String },
    text:  { type: String },
    time:  { type: Date, default: Date.now }
  }],
  shared:    { type: Number, default: 0 },
  deleted:   { type: Boolean, default: false }
}, { timestamps: true });

const Post = mongoose.models.Post || mongoose.model('Post', PostSchema);

// GET all posts
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find({ deleted: false })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ posts });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST new post
router.post('/', async (req, res) => {
  try {
    const { phone, name, city, text, imgs } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });
    const post = await Post.create({
      phone: String(phone||'').replace(/\D/g,''),
      name: name || 'Community',
      city: city || '',
      text: text.slice(0, 2000),
      imgs: imgs || []
    });
    res.json({ success: true, post });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST like/unlike
router.post('/:id/like', async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = String(phone||'').replace(/\D/g,'');
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    
    const likedIdx = post.likedBy.indexOf(cleanPhone);
    if (likedIdx >= 0) {
      post.likedBy.splice(likedIdx, 1);
      post.likes = Math.max(0, post.likes - 1);
    } else {
      post.likedBy.push(cleanPhone);
      post.likes += 1;
    }
    await post.save();
    res.json({ likes: post.likes, liked: likedIdx < 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST add comment
router.post('/:id/comment', async (req, res) => {
  try {
    const { phone, name, text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    
    const comment = {
      id: new mongoose.Types.ObjectId().toString(),
      name: name || 'Member',
      phone: String(phone||'').replace(/\D/g,''),
      text: text.slice(0, 500)
    };
    post.comments.push(comment);
    await post.save();
    res.json({ success: true, comment, total: post.comments.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE post
router.delete('/:id', async (req, res) => {
  try {
    const { phone } = req.body;
    const ADMIN_PHONES = (process.env.ADMIN_PHONES || '9415061063,9839060377,9918717288').split(',');
    const cleanPhone = String(phone||'').replace(/\D/g,'');
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    if (post.phone !== cleanPhone && !ADMIN_PHONES.includes(cleanPhone)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    post.deleted = true;
    await post.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// PUT edit comment
router.put('/:id/comment/:cmtId', async (req, res) => {
  try {
    const { phone, text } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const cmt = post.comments.id(req.params.cmtId) || post.comments.find(c => c.id === req.params.cmtId);
    if (!cmt) return res.status(404).json({ error: 'Comment not found' });
    if (cmt.phone !== String(phone).replace(/\D/g,'')) return res.status(403).json({ error: 'Not yours' });
    cmt.text = text.slice(0, 500);
    await post.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE comment
router.delete('/:id/comment/:cmtId', async (req, res) => {
  try {
    const { phone } = req.body;
    const ADMIN_PHONES = (process.env.ADMIN_PHONES || '9415061063,9839060377,9918717288').split(',');
    const cleanPhone = String(phone||'').replace(/\D/g,'');
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const cmtIdx = post.comments.findIndex(c => c.id === req.params.cmtId || String(c._id) === req.params.cmtId);
    if (cmtIdx < 0) return res.status(404).json({ error: 'Comment not found' });
    const cmt = post.comments[cmtIdx];
    if (cmt.phone !== cleanPhone && !ADMIN_PHONES.includes(cleanPhone)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    post.comments.splice(cmtIdx, 1);
    await post.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
