const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// In-memory map: userId → socketId
const onlineUsers = new Map();

module.exports = (io) => {

  // ── Socket auth middleware ─────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
                 || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select('_id name role status');

      if (!user)                     return next(new Error('User not found'));
      if (user.status === 'blocked') return next(new Error('Account blocked'));

      socket.userId = user._id.toString();
      socket.user   = user;
      next();

    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── On connection ──────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`🟢 Connected: ${socket.user.name} [${socket.id}]`);

    // Join personal room
    socket.join(`user_${userId}`);
    onlineUsers.set(userId, socket.id);

    // Mark online in DB
    try {
      await User.findByIdAndUpdate(userId, {
        online:   true,
        socketId: socket.id
      });
    } catch (e) { console.error('online update error:', e.message); }

    // Broadcast this user is online
    socket.broadcast.emit('userOnline', { userId });

    // Send current online list to this socket
    socket.emit('onlineUsers', { users: Array.from(onlineUsers.keys()) });

    // ── TYPING INDICATORS ─────────────────────────────
    let typingTimer = null;

    socket.on('typing', ({ receiverId, chatKey }) => {
      io.to(`user_${receiverId}`).emit('userTyping', {
        senderId: userId,
        chatKey,
        typing: true
      });
      // Auto stop after 3 seconds if client forgets
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        io.to(`user_${receiverId}`).emit('userTyping', {
          senderId: userId,
          chatKey,
          typing: false
        });
      }, 3000);
    });

    socket.on('stopTyping', ({ receiverId, chatKey }) => {
      clearTimeout(typingTimer);
      io.to(`user_${receiverId}`).emit('userTyping', {
        senderId: userId,
        chatKey,
        typing: false
      });
    });

    // ── MESSAGE SEEN ───────────────────────────────────
    socket.on('markSeen', ({ messageIds, chatKey, senderId }) => {
      if (!Array.isArray(messageIds) || !senderId) return;
      io.to(`user_${senderId}`).emit('msgsSeen', {
        messageIds,
        chatKey,
        seenBy:   userId,
        seenAt:   new Date()
      });
    });

    // ── MESSAGE DELIVERED ACK ──────────────────────────
    socket.on('markDelivered', ({ messageIds, chatKey, senderId }) => {
      if (!Array.isArray(messageIds) || !senderId) return;
      io.to(`user_${senderId}`).emit('msgsDelivered', {
        messageIds,
        chatKey
      });
    });

    // ── JOIN ROOM (for future group chats) ─────────────
    socket.on('joinRoom', ({ roomId }) => {
      socket.join(`room_${roomId}`);
    });

    socket.on('leaveRoom', ({ roomId }) => {
      socket.leave(`room_${roomId}`);
    });

    // ── DISCONNECT ─────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`🔴 Disconnected: ${socket.user.name} — ${reason}`);
      clearTimeout(typingTimer);

      onlineUsers.delete(userId);

      try {
        await User.findByIdAndUpdate(userId, {
          online:   false,
          lastSeen: new Date(),
          socketId: ''
        });
      } catch (e) { console.error('offline update error:', e.message); }

      socket.broadcast.emit('userOffline', {
        userId,
        lastSeen: new Date()
      });
    });

    socket.on('error', (err) => {
      console.error(`Socket error [${socket.user.name}]:`, err.message);
    });

  }); // end connection

  // ── Helpers accessible from controllers ────────────
  io.getOnlineUsers = () => Array.from(onlineUsers.keys());
  io.isOnline       = (id) => onlineUsers.has(id.toString());

};
