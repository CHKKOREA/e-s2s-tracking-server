const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
const appendToNotion = require('./notion');

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.send('✅ S2S 서버가 정상 작동 중입니다.'));

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

  // ✅ AliExpress가 응답을 확실히 인식할 수 있도록 명시적으로 지정!
  res.status(200).set('Content-Type', 'text/plain').send('OK');
});

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});
