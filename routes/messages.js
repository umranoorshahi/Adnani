const router  = require('express').Router();
const { protect } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const {
  sendMessage, getMessages, getConversations,
  deleteMessage, editMessage
} = require('../controllers/messageController');

// ─────────────────────────────────────────────────────
// BUG FIX 2: /conversations MUST be before /:userId
// otherwise Express treats "conversations" as a userId
// ─────────────────────────────────────────────────────

router.get('/conversations',  protect, getConversations);                        // ← FIRST
router.post('/send',          protect, uploadSingle('media', 20), sendMessage);  // send message
router.get('/:userId',        protect, getMessages);                             // get chat history ← AFTER
router.delete('/:id',         protect, deleteMessage);                           // delete message
router.put('/:id',            protect, editMessage);                             // edit message

module.exports = router;
