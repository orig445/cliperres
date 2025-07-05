const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

cloudinary.config({
  cloud_name: 'dktmo7zlx',
  api_key: '462451952435872',
  api_secret: process.env.CLOUDINARY_SECRET,
});

// פונקציית חיתוך
const cutClip = (inputPath, outputPath, start, duration) => {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${inputPath}" -ss ${start} -t ${duration} -c:v libx264 -c:a aac -strict experimental "${outputPath}"`;
    exec(cmd, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
};

app.post('/api/cut_video', async (req, res) => {
  try {
    const { video_file_url, clips_data, user_settings, base44_callback_url } = req.body;

    const inputPath = `tmp/input_${Date.now()}.mp4`;
    const writer = fs.createWriteStream(inputPath);
    const response = await axios.get(video_file_url, { responseType: 'stream' });
    response.data.pipe(writer);
    await new Promise((resolve) => writer.on('finish', resolve));

    const uploadedClips = [];

    for (const clip of clips_data) {
      const start = clip.start;
      const end = clip.end;
      const duration = end - start;
      const title = clip.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const outputPath = `tmp/${title}_${Date.now()}.mp4`;

      await cutClip(inputPath, outputPath, start, duration);

      const result = await cloudinary.uploader.upload(outputPath, {
        resource_type: 'video',
        folder: 'clips',
      });

      uploadedClips.push({
        title: clip.title,
        url: result.secure_url,
        start,
        end,
      });

      fs.unlinkSync(outputPath);
    }

    fs.unlinkSync(inputPath);

    await fetch(base44_callback_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'done',
        clips: uploadedClips,
      }),
    });

    res.status(200).json({ message: 'All clips processed and sent back.' });
  } catch (err) {
    console.error('Error cutting video:', err);
    res.status(500).json({ error: 'Processing failed.' });
  }
});

app.get('/', (req, res) => {
  res.send('Cliper AI Server is Running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


