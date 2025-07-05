const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json({ limit: '100mb' }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.post('/api/create-clips', async (req, res) => {
  const { video_id, original_video_url, clips } = req.body;
  const job_id = uuidv4();
  const tempPath = path.join(__dirname, 'temp');
  await fs.ensureDir(tempPath);
  const originalPath = path.join(tempPath, `${video_id}.mp4`);

  try {
    const response = await axios({ url: original_video_url, method: 'GET', responseType: 'stream' });
    const writer = fs.createWriteStream(originalPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const results = [];

    for (const clip of clips) {
      const outputPath = path.join(tempPath, `${clip.clip_id}.mp4`);
      await new Promise((resolve, reject) => {
        ffmpeg(originalPath)
          .setStartTime(clip.start_time)
          .setDuration(clip.end_time - clip.start_time)
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const uploaded = await cloudinary.uploader.upload(outputPath, {
        resource_type: 'video',
        folder: 'cliper_clips',
        public_id: clip.clip_id,
      });

      results.push({
        ...clip,
        video_url: uploaded.secure_url,
      });

      await fs.remove(outputPath);
    }

    await fs.remove(originalPath);

    await axios.post(process.env.CALLBACK_URL, {
      video_id,
      job_id,
      clips: results,
    });

    res.json({ success: true, message: 'Clips received and processing started', job_id });
  } catch (err) {
    console.error('Processing error:', err);
    res.status(500).json({ success: false, message: 'Processing failed' });
  }
});

app.get('/', (req, res) => {
  res.send('Cliper AI Server is live');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

