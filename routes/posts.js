// routes/posts.js
const router = require('express').Router();
const { Post } = require('../models/ContentModels');
const { authMiddleware, requireConsent, requireApproval } = require('../middleware/auth');
router.use(authMiddleware, requireApproval, requireConsent);

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find({ deleted: false })
      .populate('author', 'name city')
      .sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, posts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { text, media_urls, location } = req.body;
    const post = await Post.create({ author: req.user._id, text, media_urls, location });
    res.status(201).json({ success: true, post });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/like', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const liked = post.likes.includes(req.user._id);
    if (liked) post.likes.pull(req.user._id);
    else post.likes.push(req.user._id);
    await post.save();
    res.json({ success: true, likes: post.likes.length, liked: !liked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/comment', async (req, res) => {
  try {
    const { text } = req.body;
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: { author: req.user._id, text } } },
      { new: true }
    );
    res.json({ success: true, comments: post.comments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const isOwner = String(post.author) === String(req.user._id);
    const isAdm   = req.user.isAdmin || req.user.role === 'admin';
    if (!isOwner && !isAdm) return res.status(403).json({ error: 'Not authorized' });
    post.deleted = true; post.deleted_at = new Date();
    await post.save();
    res.json({ success: true, message: 'Post deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
