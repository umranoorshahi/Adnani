const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:  { type: String, default: '' },
  userPic:   { type: String, default: '' },
  text:      { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
});

const PostSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content:   { type: String, default: '', maxlength: 2000 },
  images:    [{ type: String }],
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments:  [CommentSchema],
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

PostSchema.index({ createdAt: -1 });
PostSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Post', PostSchema);
