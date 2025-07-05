const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// דף הבית (סתם בדיקה)
app.get('/', (req, res) => {
  res.send('Cliper Server is running!');
});

// הנתיב ש-Base44 שולחת אליו את בקשת הוידאו
app.post('/api/cut_video', (req, res) => {
  console.log('📥 בקשה מ-Base44 התקבלה!');
  console.log(JSON.stringify(req.body, null, 2)); // מדפיס את כל הנתונים

  // שלב עתידי: עיבוד וידאו אמיתי

  res.status(200).json({ status: 'ok', message: 'הבקשה התקבלה בהצלחה' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
