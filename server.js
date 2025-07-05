const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json({ limit: '100mb' }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ensureDir = dir => fs.ensureDir(dir);
const writeSrt = async (filePath, text, duration) => {
  // יוצר קובץ SRT עם כתובית אחת מתוזמנת לכל אורך הקליפ
  const end = new Date(duration * 1000).toISOString().substr(11, 12).replace('.', ',');
  const content =
    `1\n` +
    `00:00:00,000 --> ${end}\n` +
    `${text}\n`;
  await fs.writeFile(filePath, content);
};

const cutAndSub = (input, output, start, dur, srtFile) => {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(start)
      .setDuration(dur)
      .outputOptions(`-vf subtitles=${srtFile}`)
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
};

app.post('/api/create-clips', async (req, res) => {
  const { video_id, original_video_url, clips } = req.body;
  const job_id = uuidv4();
  const tmpDir = path.join(__dirname, 'tmp', job_id);
  await ensureDir(tmpDir);
  const originalPath = path.join(tmpDir, `${video_id}.mp4`);

  try {
    // הורדת הסרטון המקורי
    const response = await axios({ url: original_video_url, method: 'GET', responseType: 'stream' });
    await new Promise((r, rej) => {
      const w = fs.createWriteStream(originalPath);
      response.data.pipe(w);
      w.on('finish', r);
      w.on('error', rej);
    });

    const results = [];

    for (const clip of clips) {
      const { clip_id, start_time, end_time, transcription_snippet } = clip;
      const dur = end_time - start_time;
      const clipMp4 = path.join(tmpDir, `${clip_id}.mp4`);
      const srtFile = path.join(tmpDir, `${clip_id}.srt`);

      // יצירת SRT
      await writeSrt(srtFile, transcription_snippet, dur);

      // חיתוך + הטמעת כתוביות
      await cutAndSub(originalPath, clipMp4, start_time, dur, srtFile);

      // העלאה ל־Cloudinary
      const uploadRes = await cloudinary.uploader.upload(clipMp4, {
        resource_type: 'video',
        folder: 'cliper_clips',
        public_id: clip_id
      });

      results.push({
        ...clip,
        video_url: uploadRes.secure_url
      });

      // ניקוי קבצים זמניים של הקליפ
      await fs.remove(clipMp4);
      await fs.remove(srtFile);
    }

    // מחיקת הקובץ המקורי
    await fs.remove(originalPath);

    // שליחת callback ל־Base44
    await axios.post(process.env.CALLBACK_URL, {
      video_id,
      job_id,
      clips: results
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


