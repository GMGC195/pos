const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }

  // Upload to Cloudinary using a stream
  const cld_upload_stream = cloudinary.uploader.upload_stream(
    { folder: 'pizza-shop' },
    (error, result) => {
      if (error) {
        console.error('Cloudinary Upload Error:', error);
        return res.status(500).json({ error: 'Upload failed' });
      }
      res.json({ secure_url: result.secure_url });
    }
  );

  streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
});

module.exports = router;
