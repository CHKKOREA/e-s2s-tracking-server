const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
const appendToNotion = require('./notion');

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.send('✅ S2S 서버가 정상 작동 중입니다.'));

// ✅ AliExpress 테스트용 GET 요청 대응 추가!
app.get('/order-s2s', (req, res) => {
  res.status(200).set('Content-Type', 'text/plain').send('GET OK');
});

app.post('/order-s2s', async (req, res) => {
  const { order_id, commission_fee, currency, tracking_id } = req.body;
  const row = [order_id, commission_fee, currency, tracking_id, new Date().toISOString()];

  console.log('🧾 [ORDER S2S] 알림 수신:', req.body);
  console.log('📤 Notion으로 전송할 데이터:', row);

  try {
    await appendToNotion(row);
    console.log('✅ Notion 저장 완료:', row);
  } catch (err) {
    console.error('❌ Notion 저장 실패:', err.message);
  }

  res.status(200).set('Content-Type', 'text/plain').send('OK');
});

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});
