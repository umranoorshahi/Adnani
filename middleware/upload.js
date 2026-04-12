const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Ensure uploads dir exists (BUG 5 FIX: use __dirname not process.cwd())
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|mp4|mp3|aac|ogg|pdf|doc|docx/;
  const ext  = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) return cb(null, true);
  cb(new Error('File type not supported'));
};

// Single file (profile, media message)
const uploadSingle = (fieldName, maxMB = 10) =>
  multer({ storage, fileFilter, limits: { fileSize: maxMB * 1024 * 1024 } }).single(fieldName);

// Multiple files (post images)
const uploadMultiple = (fieldName, maxCount = 4, maxMB = 10) =>
  multer({ storage, fileFilter, limits: { fileSize: maxMB * 1024 * 1024 } }).array(fieldName, maxCount);

module.exports = { uploadSingle, uploadMultiple, UPLOAD_DIR };
