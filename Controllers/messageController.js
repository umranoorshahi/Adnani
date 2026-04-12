const Message  = require('../models/Message');
const User     = require('../models/User');
const mongoose = require('mongoose');

// BUG FIX 8: consistent chatKey using string IDs
const makeChatKey = (a, b) => [a.toString(), b.toString()].sort().join('_');

// ── POST /api/messages/send ───────────────────────────
const sendMessage = async (req, res) => {
  try {
    const { receiverId, text, type = 'text', replyTo } = req.body;

    if (!receiverId) {
      return res.status(400).json({ success: false, message: 'receiverId is required' });
    }
    if (!text && !req.file) {
      return res.status(400).json({ success: false, message: 'Message text or media required' });
    }

    // Validate receiver exists
    const receiver = await User.findById(receiverId).select('socketId online');
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'Receiver not found' });
    }

    const chatKey = makeChatKey(req.user._id, receiverId);
    const msgData = {
      senderId:   req.user._id,
      receiverId: new mongoose.Types.ObjectId(receiverId), // BUG FIX: ensure ObjectId
      chatKey,
      text:       text || '',
      type,
      status:     'sent'
    };

    if (req.file) {
      msgData.mediaUrl = `/uploads/${req.file.filename}`;
      msgData.type     = req.body.type || 'image';
    }

    if (replyTo) msgData.replyTo = replyTo;

    const message = await (await Message.create(msgData))
      .populate('senderId', 'name profilePic');

    // Real-time delivery
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${receiverId}`).emit('newMessage', { message });

      // Auto-mark delivered if receiver is online
      if (receiver.online) {
        await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
        message.status = 'delivered';
        io.to(`user_${req.user._id}`).emit('msgDelivered', { messageId: message._id, chatKey });
      }
    }

    res.status(201).json({ success: true, message });

  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/messages/conversations ──────────────────
// BUG FIX 4: replaced N+1 queries with aggregation pipeline
const getConversations = async (req, res) => {
  try {
    const myId = req.user._id;

    const conversations = await Message.aggregate([
      // Step 1: find all messages involving current user
      {
        $match: {
          $or: [{ senderId: myId }, { receiverId: myId }],
          isDeleted: false
        }
      },
      // Step 2: sort by newest first
      { $sort: { createdAt: -1 } },
      // Step 3: group by chatKey — keep only the latest message per chat
      {
        $group: {
          _id:         '$chatKey',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ['$receiverId', myId] },
                  { $ne: ['$status', 'seen'] },
                  { $eq: ['$isDeleted', false] }
                ]},
                1, 0
              ]
            }
          }
        }
      },
      // Step 4: sort by lastMessage time
      { $sort: { 'lastMessage.createdAt': -1 } }
    ]);

    // Fetch other user details for each conversation
    const result = await Promise.all(conversations.map(async (conv) => {
      const msg      = conv.lastMessage;
      const otherId  = msg.senderId.toString() === myId.toString()
        ? msg.receiverId
        : msg.senderId;

      const other = await User.findById(otherId)
        .select('name phone username profilePic online lastSeen city');

      return {
        chatKey:     conv._id,
        other,
        lastMessage: {
          text:      msg.isDeleted ? 'Message deleted' : msg.text,
          type:      msg.type,
          status:    msg.status,
          createdAt: msg.createdAt,
          isDeleted: msg.isDeleted,
          fromMe:    msg.senderId.toString() === myId.toString()
        },
        unreadCount: conv.unreadCount
      };
    }));

    // Remove convos where other user no longer exists
    const filtered = result.filter(c => c.other !== null);

    res.json({ success: true, conversations: filtered });

  } catch (err) {
    console.error('getConversations error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/messages/:userId ─────────────────────────
const getMessages = async (req, res) => {
  try {
    const chatKey = makeChatKey(req.user._id, req.params.userId);
    const page    = parseInt(req.query.page) || 1;
    const limit   = 30;

    const messages = await Message.find({ chatKey, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('senderId', 'name profilePic')
      .populate('replyTo', 'text type senderId');

    // Mark received messages as seen
    const myId   = req.user._id.toString();
    const unread = messages.filter(
      m => m.receiverId.toString() === myId && m.status !== 'seen'
    );

    if (unread.length) {
      const ids = unread.map(m => m._id);
      await Message.updateMany({ _id: { $in: ids } }, { status: 'seen', seenAt: new Date() });

      const io = req.app.get('io');
      if (io) {
        io.to(`user_${req.params.userId}`).emit('msgsSeen', {
          messageIds: ids,
          chatKey,
          seenBy: req.user._id
        });
      }
    }

    res.json({ success: true, chatKey, messages: messages.reverse(), page });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/messages/:id ──────────────────────────
const deleteMessage = async (req, res) => {
  try {
    const msg = await Message.findOne({
      _id:      req.params.id,
      senderId: req.user._id
    });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    msg.isDeleted = true;
    msg.text      = '';
    msg.mediaUrl  = '';
    await msg.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${msg.receiverId}`).emit('msgDeleted', {
        messageId: msg._id,
        chatKey:   msg.chatKey
      });
    }

    res.json({ success: true, messageId: msg._id });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/messages/:id ─────────────────────────────
const editMessage = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Text required' });
    }

    const msg = await Message.findOne({
      _id:      req.params.id,
      senderId: req.user._id,
      isDeleted: false
    });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    msg.text     = text.trim();
    msg.isEdited = true;
    await msg.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${msg.receiverId}`).emit('msgEdited', { message: msg });
    }

    res.json({ success: true, message: msg });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { sendMessage, getMessages, getConversations, deleteMessage, editMessage };
