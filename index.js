const fs = require('fs');
if (!fs.existsSync('./extreme-hull-456718-i1-6bb8509e66fc.json')) {
  fs.writeFileSync(
    './extreme-hull-456718-i1-6bb8509e66fc.json',
    process.env.GOOGLE_CREDENTIALS_JSON
  );
}
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;
const appendToSheet = require('./sheets');

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.send('✅ S2S 서버가 정상 작동 중입니다.'));

app.post('/order-s2s', async (req, res) => {
  const { order_id, commission_fee, currency, tracking_id } = req.body;
  const row = [order_id, commission_fee, currency, tracking_id, new Date().toISOString()];

  console.log('🧾 [ORDER S2S] 알림 수신:', req.body);
  console.log('📤 구글 시트로 전송할 데이터:', row);

  try {
    await appendToSheet(row);
    console.log('✅ 구글 시트 저장 완료:', row);
  } catch (err) {
    console.error('❌ 구글 시트 저장 실패:', err.message);
  }

  res.send('OK');
});

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});