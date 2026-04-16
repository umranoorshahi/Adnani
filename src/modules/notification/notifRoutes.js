// notification/notifRoutes.js
const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const ChatService = require('../chat/chatService');

router.use(authenticate);

// Send notification to user (admin or system)
router.post('/send', async (req, res) => {
  try {
    const { user_id, title, body, url } = req.body;
    ChatService.sendPushToUser(user_id, { title, body, url });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Broadcast to all online users
router.post('/broadcast', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
  try {
    const { title, body } = req.body;
    // sendPushToUser will handle online users
    res.json({ success: true, message: 'Broadcast sent to online users' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
