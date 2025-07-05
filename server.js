const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// קונפיגורציית Cloudinary
cloudinary.config({
  cloud_name: 'dcd825-05', // שים פה את ה-cloud_name שלך (מה-URL)
  api_key: '462451952435872',
  api_secret: process.env.CLOUDINARY_SECRET
});

// העלאת קבצים בזיכרון בלבד (ללא שמירה בדיסק)
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        public_id: `clips/${Date.now()}_${fileName}`,
      },
      (error, result) => {
        if (error) {
          console.error('Upload error:', error);
          return res.status(500).json({ error: 'Upload failed' });
        }
        res.json({ url: result.secure_url });
      }
    );

    Readable.from(fileBuffer).pipe(stream);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.send('Cliper Server is running!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
;
});

// הרצת השרת
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
