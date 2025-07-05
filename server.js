const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// בדיקה פשוטה - שיראה שהשרת באוויר
app.get('/', (req, res) => {
  res.send('Cliper Server is running!');
});

// ✅ זה הנתיב ש-Base44 שולחת אליו את כל המידע לעיבוד!
app.post('/api/cut_video', (req, res) => {
  console.log('📥 קיבלתי נתונים מ־Base44:');
  console.log(JSON.stringify(req.body, null, 2));

  // דמו של קליפים חתוכים לחזרה ל־Base44
  const clips = req.body.clips_data.map((clip, index) => ({
    id: index + 1,
    title: clip.title,
    file_url: `https://cliper-ai.onrender.com/videos/clip_${index + 1}.mp4`,
    status: "completed"
  }));

  res.json({
    job_id: "cliper-job-001",
    status: "processing_started",
    clips: clips
  });
});

// הרצת השרת
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
