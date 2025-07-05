const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

cloudinary.config({
  cloud_name: 'dktmo7zlx',
  api_key: '462451952435872',
  api_secret: process.env.CLOUDINARY_SECRET
});

app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const path = req.file.path;

    const result = await cloudinary.uploader.upload(path, {
      resource_type: 'video',
      folder: 'cliper',
    });

    fs.unlinkSync(path);
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/', (req, res) => {
  res.send('Cliper AI Server is Running');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

