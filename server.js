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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper: ensure directory exists
async function ensureDir(dir) {
  await fs.ensureDir(dir);
}

// Helper: cut & burn subtitles
function cutWithSubtitles(input, output, start, duration, srtPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions(`-vf subtitles=${srtPath}`)
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// Helper: write simple SRT file (one cue)
async function writeSrt(srtPath, text, duration) {
  const end   = new Date(duration * 1000).toISOString().substr(11, 12).replace('.', ',');
  const srt   =
    `1\n` +
    `00:00:00,000 --> ${end}\n` +
    `${text}\n`;
  await fs.writeFile(srtPath, srt);
}

// 1) Endpoint: receive clips instructions from Base44
app.post('/api/create-clips', async (req, res) => {
  const { video_id, original_video_url, clips } = req.body;
  const job_id = uuidv4();

  const workdir      = path.join(__dirname, 'tmp', job_id);
  const originalPath = path.join(workdir, `${video_id}.mp4`);
  await ensureDir(workdir);

  try {
    // download original video
    const resp = await axios({
      url: original_video_url,
      method: 'GET',
      responseType: 'stream'
    });
    await new Promise((r, rej) => {
      const ws = fs.createWriteStream(originalPath);
      resp.data.pipe(ws);
      ws.on('finish', r);
      ws.on('error', rej);
    });

    const results = [];
    // process each clip
    for (const clip of clips) {
      const { clip_id, start_time, end_time, transcription_snippet } = clip;
      const dur       = end_time - start_time;
      const clipMp4   = path.join(workdir, `${clip_id}.mp4`);
      const clipSrt   = path.join(workdir, `${clip_id}.srt`);

      // write SRT for this clip
      await writeSrt(clipSrt, transcription_snippet, dur);

      // cut & burn subtitles
      await cutWithSubtitles(originalPath, clipMp4, start_time, dur, clipSrt);

      // upload to Cloudinary
      const uploadRes = await cloudinary.uploader.upload(clipMp4, {
        resource_type: 'video',
        folder: 'cliper_clips',
        public_id: clip_id
      });

      results.push({
        ...clip,
        video_url: uploadRes.secure_url
      });

      // cleanup clip files
      await fs.remove(clipMp4);
      await fs.remove(clipSrt);
    }

    // cleanup original
    await fs.remove(originalPath);

    // callback to Base44
    await axios.post(process.env.CALLBACK_URL, {
      video_id,
      job_id,
      clips: results
    });

    return res.json({
      success: true,
      message: 'Clips received and processing started',
      job_id
    });

  } catch (err) {
    console.error('Processing error:', err);
    return res.status(500).json({
      success: false,
      message: 'Processing failed'
    });
  }
});

// 2) Endpoint: receive callback from Base44 (if needed)
app.post('/api/externalCuttingCallback', (req, res) => {
  console.log('📬 Callback received:', JSON.stringify(req.body, null,2));
  // TODO: save to DB or notify user
  res.json({ success: true });
});

// health check
app.get('/', (req, res) => {
  res.send('Cliper AI Server is live');
});

// start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

