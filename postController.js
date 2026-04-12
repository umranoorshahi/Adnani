const Post = require('../models/Post');

// ── GET /api/posts ─────────────────────────────────────
const getPosts = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 15;
    const myId  = req.user._id.toString();

    const [posts, total] = await Promise.all([
      Post.find({ isDeleted: false })
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate('userId', 'name profilePic city username'),
      Post.countDocuments({ isDeleted: false })
    ]);

    const result = posts.map(p => ({
      ...p.toObject(),
      hasLiked:     p.likes.some(id => id.toString() === myId),
      likeCount:    p.likes.length,
      commentCount: p.comments.length
    }));

    res.json({ success: true, posts: result, total, page });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// BUG FIX 10: GET /api/posts/user/:userId — posts by a specific user
const getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const page  = parseInt(req.query.page) || 1;
    const limit = 15;
    const myId  = req.user._id.toString();

    const posts = await Post.find({ userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'name profilePic city username');

    const result = posts.map(p => ({
      ...p.toObject(),
      hasLiked:  p.likes.some(id => id.toString() === myId),
      likeCount: p.likes.length
    }));

    res.json({ success: true, posts: result });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/posts ───────────────────────────────────
const createPost = async (req, res) => {
  try {
    const { content } = req.body;
    const images = (req.files || []).map(f => `/uploads/${f.filename}`);

    if (!content && !images.length) {
      return res.status(400).json({ success: false, message: 'Post content or image required' });
    }

    const post = await Post.create({
      userId:  req.user._id,
      content: content ? content.trim() : '',
      images
    });

    await post.populate('userId', 'name profilePic city username');

    const io = req.app.get('io');
    if (io) io.emit('newPost', { post });

    res.status(201).json({ success: true, post });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/posts/:id/like ──────────────────────────
const likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const myId  = req.user._id;
    const liked = post.likes.some(id => id.toString() === myId.toString());

    if (liked) post.likes.pull(myId);
    else       post.likes.addToSet(myId);
    await post.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('postLiked', {
        postId:    post._id,
        userId:    myId,
        liked:     !liked,
        likeCount: post.likes.length
      });
    }

    res.json({ success: true, liked: !liked, likeCount: post.likes.length });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/posts/:id/comment ───────────────────────
const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text required' });
    }

    const post = await Post.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = {
      userId:   req.user._id,
      userName: req.user.name,
      userPic:  req.user.profilePic || '',
      text:     text.trim()
    };
    post.comments.push(comment);
    await post.save();

    const newComment = post.comments[post.comments.length - 1];

    const io = req.app.get('io');
    if (io) io.emit('newComment', { postId: post._id, comment: newComment });

    res.status(201).json({ success: true, comment: newComment });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// BUG FIX 9: DELETE /api/posts/:id/comment/:commentId
const deleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Only comment owner or admin can delete
    if (comment.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    comment.deleteOne();
    await post.save();

    const io = req.app.get('io');
    if (io) io.emit('commentDeleted', { postId: post._id, commentId: req.params.commentId });

    res.json({ success: true, message: 'Comment deleted' });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/posts/:id ─────────────────────────────
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.isDeleted) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const isOwner = post.userId.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    post.isDeleted = true;
    await post.save();

    const io = req.app.get('io');
    if (io) io.emit('postDeleted', { postId: post._id });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getPosts, getPostsByUser, createPost, likePost, addComment, deleteComment, deletePost };
