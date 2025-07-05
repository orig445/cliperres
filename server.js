import express from 'express';
import fetch from 'node-fetch';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

const TMP_DIR    = path.resolve('./tmp');
const OUTPUT_DIR = path.resolve('./output');
await fs.ensureDir(TMP_DIR);
await fs.ensureDir(OUTPUT_DIR);

// helper: הורדת URL ל־local file
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(destPath);
  await new Promise((r, e) => {
    res.body.pipe(fileStream);
    res.body.on('error', e);
    fileStream.on('finish', r);
  });
}

// helper: יצירת קובץ SRT לכתוביות
async function writeSrt(clip, destPath) {
  const start = new Date(clip.start_time * 1000).toISOString().substr(11, 12).replace('.', ',');
  const endMs = clip.start_time + clip.duration;
  const end   = new Date(endMs * 1000).toISOString().substr(11, 12).replace('.', ',');
  const srt  = `1
${start} --> ${end}
${clip.transcription_snippet || ''}

`;
  await fs.writeFile(destPath, srt, 'utf8');
}

app.post('/api/create-clips', async (req, res) => {
  const { video_id, original_video_url, clips } = req.body;
  const jobId = `${video_id}_${Date.now()}`;
  console.log(`▶️ Job ${jobId}: received ${clips.length} clips`);

  try {
    // 1) הורדת הווידאו בפעם הראשונה
    const originalPath = path.join(TMP_DIR, `${video_id}.mp4`);
    if (!await fs.pathExists(originalPath)) {
      console.log('🔽 Downloading original video…');
      await downloadFile(original_video_url, originalPath);
    }

    // 2) לעבד כל קליפ
    for (const clip of clips) {
      const clipFile = path.join(OUTPUT_DIR, `${clip.clip_id}.mp4`);
      const srtFile  = path.join(TMP_DIR, `${clip.clip_id}.srt`);

      console.log(`✂️ Cutting clip ${clip.clip_id}: ${clip.start_time}s → ${clip.duration}s`);

      // 2a) תכתוב SRT
      await writeSrt(clip, srtFile);

      // 2b) ffmpeg: חיתוך + כתוביות
      await new Promise((resolve, reject) => {
        ffmpeg(originalPath)
          .setStartTime(clip.start_time)
          .setDuration(clip.duration)
          .outputOptions(
            '-vf', `subtitles=${srtFile}:force_style='FontName=Arial,FontSize=24'`
          )
          .output(clipFile)
          .on('end', () => {
            console.log(`✅ Clip ${clip.clip_id} ready at ${clipFile}`);
            resolve();
          })
          .on('error', err => {
            console.error(`❌ Failed processing ${clip.clip_id}:`, err);
            reject(err);
          })
          .run();
      });
    }

    // 3) תשוב מיד שהעבודה התחילה
    return res.json({
      success: true,
      message: 'Clips received and processing started',
      job_id: jobId
    });

  } catch (err) {
    console.error('❌ /api/create-clips error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/', (_req, res) => res.send('Cliper AI Server is Running'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));


