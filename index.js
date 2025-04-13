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
const fs = require('fs');
const path = require('path');

app.post('/order-s2s', express.urlencoded({ extended: true }), (req, res) => {
  const logLine = `[${new Date().toISOString()}] 🧾 [ORDER S2S] 알림 수신: ${JSON.stringify(req.body)}\n`;
  const logFilePath = path.join(__dirname, 'order-s2s.log');

  fs.appendFile(logFilePath, logLine, (err) => {
    if (err) {
      console.error('로그 파일 저장 오류:', err.message);
    } else {
      console.log('✅ S2S 로그 기록 완료');
    }
  });

  res.send('OK');
});

const appendToSheet = require('./sheets');

app.post('/order-s2s', express.urlencoded({ extended: true }), async (req, res) => {
  const { order_id, commission_fee, currency, tracking_id } = req.body;
  const row = [order_id, commission_fee, currency, tracking_id, new Date().toISOString()];

  try {
    await appendToSheet(row);
    console.log('✅ 구글 시트 저장 완료:', row);
  } catch (err) {
    console.error('❌ 구글 시트 저장 실패:', err.message);
  }

  res.send('OK');
});
