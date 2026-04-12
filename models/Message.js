const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // chatKey = sorted [senderId, receiverId].join('_') for fast retrieval
  chatKey:    { type: String, required: true },
  text:       { type: String, default: '' },
  type:       { type: String, enum: ['text', 'image', 'audio', 'gif', 'video', 'document'], default: 'text' },
  mediaUrl:   { type: String, default: '' },
  status:     { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  seenAt:     { type: Date, default: null },
  isDeleted:  { type: Boolean, default: false },
  isEdited:   { type: Boolean, default: false },
  replyTo:    { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null }
}, { timestamps: true });

// Compound index for fast chat retrieval
MessageSchema.index({ chatKey: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
