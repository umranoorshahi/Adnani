const router  = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const {
  getUsers, getMyProfile, getUser,
  updateProfile, getPending, approveUser, getStatus
} = require('../controllers/userController');

// ─────────────────────────────────────────────────────
// BUG FIX 1+3: specific routes MUST come before /:id
// otherwise /status, /pending, /profile match as :id param
// ─────────────────────────────────────────────────────

router.get('/me',            protect, getMyProfile);          // GET own profile
router.get('/status',        protect, getStatus);             // GET online status
router.get('/pending',       protect, adminOnly, getPending); // GET pending approvals
router.get('/',              protect, getUsers);              // GET all/search users
router.put('/profile',       protect, uploadSingle('profilePic', 5), updateProfile); // PUT update profile
router.get('/:id',           protect, getUser);               // GET user by id  ← LAST
router.put('/:id/approve',   protect, adminOnly, approveUser);// PUT approve/reject

module.exports = router;
