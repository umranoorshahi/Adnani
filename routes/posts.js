const router  = require('express').Router();
const { protect } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const {
  getPosts, getPostsByUser, createPost,
  likePost, addComment, deleteComment, deletePost
} = require('../controllers/postController');

// ─────────────────────────────────────────────────────
// Specific routes before parameterised routes
// ─────────────────────────────────────────────────────

router.get('/',                                 protect, getPosts);                          // feed
router.post('/',                                protect, uploadMultiple('images', 4), createPost); // create post
router.get('/user/:userId',                     protect, getPostsByUser);                    // BUG FIX 10: posts by user
router.post('/:id/like',                        protect, likePost);                          // like / unlike
router.post('/:id/comment',                     protect, addComment);                        // add comment
router.delete('/:id/comment/:commentId',        protect, deleteComment);                     // BUG FIX 9: delete comment
router.delete('/:id',                           protect, deletePost);                        // delete post

module.exports = router;
