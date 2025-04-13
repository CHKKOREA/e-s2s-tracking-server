const express = require('express');
const axios = require('axios');
const app = express();

app.get('/click', async (req, res) => {
  const { pid, url } = req.query;
  const affiliateTrackingUrl = `https://pub.aliexpress.com/api/track?pid=${pid}`;

  console.log(`[CLICK] pid: ${pid}, redirect to: ${url}`);

  try {
    await axios.get(affiliateTrackingUrl);
  } catch (error) {
    console.error('AliExpress 트래킹 실패:', error.message);
  }

  return res.redirect(url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
app.get('/', (req, res) => res.send('✅ S2S 서버가 정상 작동 중입니다.')); 

app.post('/order-s2s', express.urlencoded({ extended: true }), (req, res) => {
  console.log('🧾 [ORDER S2S] 알림 수신:', req.body);
  res.send('OK');
});

app.get('/', (req, res) => res.send('✅ S2S 서버가 정상 작동 중입니다.'));
