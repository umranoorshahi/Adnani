/**
 * MESSAGE & POST MODELS
 * Support recursive deletion for Right to Erasure (Requirement 6)
 */

const mongoose = require('mongoose');

// ─── MESSAGE SCHEMA ───────────────────────────────────
const MessageSchema = new mongoose.Schema({
  from:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  group_id:{ type: String },
  text:    { type: String, maxlength: 5000 },
  media_url: { type: String },
  media_type:{ type: String, enum: ['image', 'video', 'audio', 'file'] },
  read:    { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

MessageSchema.index({ from: 1, deleted: 1 });
MessageSchema.index({ to: 1, deleted: 1 });

// ─── COMMENT SCHEMA ───────────────────────────────────
const CommentSchema = new mongoose.Schema({
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:    { type: String, required: true, maxlength: 2000 },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });

// ─── POST SCHEMA ──────────────────────────────────────
const PostSchema = new mongoose.Schema({
  author:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:     { type: String, maxlength: 5000 },
  media_urls: [{ type: String }],
  location: { type: String },
  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [CommentSchema],
  deleted:  { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

PostSchema.index({ author: 1, deleted: 1 });

const Message  = mongoose.model('Message', MessageSchema);
const Post     = mongoose.model('Post',    PostSchema);

module.exports = { Message, Post };
