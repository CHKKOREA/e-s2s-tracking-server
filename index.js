const express = require('express');
const { createNotionStore } = require('./notion');

function parseOrder(input) {
  const order = {};
  for (const name of ['order_id', 'commission_fee', 'currency', 'tracking_id']) {
    const value = input[name];
    if (value === undefined && name === 'tracking_id') continue;
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`invalid_${name}`);
    if (typeof value === 'number' && (!Number.isFinite(value) ||
        (name === 'order_id' && !Number.isSafeInteger(value)))) throw new Error(`invalid_${name}`);
    const text = String(value).trim();
    if ((name !== 'tracking_id' && !text) || text.length > 256 || /[\x00-\x1f]/.test(text)) {
      throw new Error(`invalid_${name}`);
    }
    order[name] = text;
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(order.commission_fee) ||
      !Number.isFinite(Number(order.commission_fee))) throw new Error('invalid_commission_fee');
  return order;
}

function createApp({ store = createNotionStore(), logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  const log = (event, metadata = {}) => logger.log(JSON.stringify({ event, ...metadata }));
  app.use((req, res, next) => {
    const started = Date.now();
    const route = req.path === '/order-s2s' ? 'callback'
      : req.path === '/healthz' ? 'readiness' : req.path === '/' ? 'root' : 'other';
    const metadata = { method: req.method, route };
    // Include unsupported methods and paths, without logging URLs or payloads.
    log('http_request', metadata);
    res.once('finish', () => log('http_response', {
      ...metadata, status: res.statusCode, duration_ms: Date.now() - started,
    }));
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.use(express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 }));
  app.get('/', (req, res) => res.type('text/plain').send('S2S receiver is running. Check /healthz for Notion readiness.'));
  app.get('/healthz', async (req, res) => {
    try {
      await store.checkReady();
      res.json({ status: 'ready', version: 's2s-receiver-v2' });
    } catch (error) {
      log('notion_not_ready', { code: error.code || 'notion_unavailable' });
      res.status(503).json({ status: 'not_ready', version: 's2s-receiver-v2' });
    }
  });
  const receive = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const input = req.method === 'GET' ? req.query : req.body;
    // A bare GET proves reachability only and must not fabricate an order.
    if (req.method === 'GET' && Object.keys(input).length === 0) {
      log('s2s_probe');
      return res.type('text/plain').send('GET OK');
    }
    // The portal preview echoes these field names, rather than real order data.
    // Recognize only that exact GET probe; never insert its placeholders.
    const previewFields = ['currency', 'order_id', 'commission_fee', 'tracking_id'];
    if (req.method === 'GET' && Object.keys(input).length === previewFields.length &&
        previewFields.every(name => input[name] === name)) {
      log('s2s_preview_probe');
      return res.type('text/plain').send('GET OK');
    }
    let order;
    try { order = parseOrder(input || {}); }
    catch (error) {
      log('s2s_rejected', { method: req.method, reason: error.message });
      return res.status(400).type('text/plain').send('Invalid order parameters');
    }
    try {
      const result = await store.save(order);
      log('s2s_saved', { method: req.method, result });
      return res.type('text/plain').send('OK');
    } catch (error) {
      // Never log SDK error bodies, tokens, or private order details.
      log('s2s_save_failed', { method: req.method, code: error.code || 'notion_unavailable' });
      const conflict = ['conflicting_existing_order', 'ambiguous_existing_order'].includes(error.code);
      return res.status(conflict ? 409 : 503).type('text/plain')
        .send(conflict ? 'Existing order conflict' : 'Order storage unavailable');
    }
  };
  app.get('/order-s2s', receive);
  app.post('/order-s2s', receive);
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : 400;
    log('s2s_invalid_body', { status });
    res.status(status).type('text/plain').send('Invalid request body');
  });
  return app;
}
if (require.main === module) {
  const port = process.env.PORT || 10000;
  createApp().listen(port, () => console.log(`S2S receiver listening on port ${port}`));
}
module.exports = { createApp, parseOrder };
