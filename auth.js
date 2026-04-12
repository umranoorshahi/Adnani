const router  = require('express').Router();
const { protect } = require('../middleware/auth');
const { sendOTP, verifyOTP, setupProfile, getMe } = require('../controllers/authController');

router.post('/send-otp',     sendOTP);
router.post('/verify-otp',   verifyOTP);
router.put('/setup-profile', protect, setupProfile);
router.get('/me',            protect, getMe);

module.exports = router;
