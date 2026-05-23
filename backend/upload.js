const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'frontend', 'uploads', 'menu');
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) ext = '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Допустимы только изображения: JPEG, PNG, WebP, GIF'));
  }
}

const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function registerUploadRoutes(app, authenticateAdmin) {
  app.post(
    '/api/admin/upload-image',
    authenticateAdmin,
    (req, res, next) => {
      uploadImage.single('image')(req, res, (err) => {
        if (err) {
          const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'Файл слишком большой (макс. 5 МБ)'
            : (err.message || 'Ошибка загрузки');
          return res.status(400).json({ error: msg });
        }
        next();
      });
    },
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'Выберите файл изображения' });
      }
      res.json({ url: `/uploads/menu/${req.file.filename}` });
    }
  );
}

module.exports = { registerUploadRoutes, UPLOAD_DIR, ensureUploadDir };
