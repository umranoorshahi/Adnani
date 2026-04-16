/**
 * CHAT SERVICE
 * Req 10: WhatsApp-like features
 * - WebSocket real-time
 * - Rate limiting & anti-spam
 * - Block/report system
 */
const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');
const Message   = require('./Message');
const { logger } = require('../../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'adnani-change-me';

// In-memory: userId → WebSocket
const clients = new Map();
// Anti-spam: userId → { count, resetAt }
const msgRates = new Map();

const MAX_MSG_PER_MIN = 30;

function initWebSocket(wss) {
  wss.on('connection', async (ws, req) => {
    // Authenticate via token in query
    const url   = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    let userId;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = String(decoded.userId);
    } catch (e) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Register client
    clients.set(userId, ws);
    logger.info(`WS connected: ${userId}`);

    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw);
        // Rate limit
        if (!checkRateLimit(userId)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Too many messages. Slow down.' }));
          return;
        }

        if (data.type === 'message') {
          await handleMessage(userId, data, ws);
        } else if (data.type === 'typing') {
          notifyTyping(userId, data.to);
        } else if (data.type === 'read') {
          await markRead(userId, data.message_id);
        }
      } catch (e) {
        logger.warn('WS message error:', e.message);
      }
    });

    ws.on('close', () => {
      clients.delete(userId);
      logger.info(`WS disconnected: ${userId}`);
    });

    // Send queued messages
    ws.send(JSON.stringify({ type: 'connected', userId }));
  });
}

function checkRateLimit(userId) {
  const now  = Date.now();
  const rate = msgRates.get(userId) || { count: 0, resetAt: now + 60000 };
  if (now > rate.resetAt) {
    msgRates.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  rate.count++;
  msgRates.set(userId, rate);
  return rate.count <= MAX_MSG_PER_MIN;
}

async function handleMessage(fromId, data, ws) {
  const { to, text, group_id, media_url } = data;
  if (!text && !media_url) return;

  // Anti-XSS: sanitize text
  const clean = text ? text.replace(/<[^>]*>/g, '').slice(0, 5000) : '';

  const msg = await Message.create({
    from: fromId, to, group_id,
    text: clean, media_url
  });

  // Deliver to recipient if online
  const targetWs = clients.get(String(to));
  if (targetWs?.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify({
      type: 'message',
      id:   msg._id,
      from: fromId,
      text: clean,
      media_url,
      time: msg.createdAt
    }));
  }

  // Confirm delivery to sender
  ws.send(JSON.stringify({ type: 'sent', id: msg._id, time: msg.createdAt }));
}

function notifyTyping(fromId, toId) {
  const targetWs = clients.get(String(toId));
  if (targetWs?.readyState === WebSocket.OPEN)
    targetWs.send(JSON.stringify({ type: 'typing', from: fromId }));
}

async function markRead(userId, messageId) {
  await Message.findByIdAndUpdate(messageId, { read: true, read_at: new Date() });
}

function sendPushToUser(userId, payload) {
  const ws = clients.get(String(userId));
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'notification', ...payload }));
}

function getOnlineCount() {
  return clients.size;
}

module.exports = { initWebSocket, sendPushToUser, getOnlineCount };
