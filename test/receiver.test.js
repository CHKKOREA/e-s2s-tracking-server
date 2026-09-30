const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../index');
const { createNotionStore } = require('../notion');

const order = { order_id: '12345678901234567890', commission_fee: '0.25', currency: 'USD', tracking_id: 's2s-test' };
async function receiver(t, store) {
  const logs = [];
  const server = createApp({ store, logger: { log: value => logs.push(value) } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { url: `http://127.0.0.1:${server.address().port}`, logs };
}

for (const format of ['GET', 'form', 'json']) {
  test(`${format} callback saves the exact identifier and amount before OK`, async t => {
    const saved = [];
    const { url } = await receiver(t, { save: async value => { saved.push(value); return 'created'; } });
    const query = new URLSearchParams(order).toString();
    const response = format === 'GET' ? await fetch(`${url}/order-s2s?${query}`)
      : await fetch(`${url}/order-s2s`, { method: 'POST',
        headers: { 'content-type': format === 'form' ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: format === 'form' ? query : JSON.stringify(order) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'OK');
    assert.deepEqual(saved, [order]);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
}
test('a reachability probe never creates an order', async t => {
  const { url } = await receiver(t, { save: () => assert.fail('probe reached persistence') });
  const response = await fetch(`${url}/order-s2s`);
  assert.equal(await response.text(), 'GET OK');
});
test('the exact AliExpress preview GET is a probe and never inserts placeholders', async t => {
  const { url, logs } = await receiver(t, { save: () => assert.fail('preview reached persistence') });
  const query = 'currency=currency&order_id=order_id&commission_fee=commission_fee&tracking_id=tracking_id';
  const response = await fetch(`${url}/order-s2s?${query}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'GET OK');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(logs.map(value => JSON.parse(value)), [{ event: 's2s_preview_probe' }]);
});
test('mixed, incomplete, extra, repeated and POST preview values stay invalid', async t => {
  const { url } = await receiver(t, { save: () => assert.fail('invalid preview reached persistence') });
  const query = 'currency=currency&order_id=order_id&commission_fee=commission_fee&tracking_id=tracking_id';
  for (const invalid of [query.replace('currency=currency', 'currency=USD'),
    query.replace('&tracking_id=tracking_id', ''), `${query}&extra=value`, `${query}&order_id=order_id`]) {
    assert.equal((await fetch(`${url}/order-s2s?${invalid}`)).status, 400);
  }
  const response = await fetch(`${url}/order-s2s`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: query });
  assert.equal(response.status, 400);
});
test('Notion failure is 503 and private payload/error messages stay out of logs', async t => {
  const { url, logs } = await receiver(t, { save: async () => { throw Object.assign(new Error('secret-token and private order'), { code: 'unauthorized' }); } });
  const response = await fetch(`${url}/order-s2s?${new URLSearchParams(order)}`);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'Order storage unavailable');
  assert.match(logs.join(''), /unauthorized/);
  assert.doesNotMatch(logs.join(''), /secret-token|private order|12345678901234567890|0\.25/);
});
test('missing IDs, repeated keys, and unsafe JSON numeric IDs are rejected', async t => {
  const { url } = await receiver(t, { save: () => assert.fail('invalid order was persisted') });
  for (const query of ['commission_fee=1&currency=USD', `${new URLSearchParams(order)}&order_id=another`]) {
    assert.equal((await fetch(`${url}/order-s2s?${query}`)).status, 400);
  }
  const response = await fetch(`${url}/order-s2s`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...order, order_id: Number.MAX_SAFE_INTEGER + 1 }) });
  assert.equal(response.status, 400);
});
test('malformed and oversized JSON fail without writing', async t => {
  const { url } = await receiver(t, { save: () => assert.fail('bad body was persisted') });
  for (const [body, status] of [['{', 400], [JSON.stringify({ data: 'x'.repeat(9000) }), 413]]) {
    const response = await fetch(`${url}/order-s2s`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(response.status, status);
  }
});
test('readiness cannot report success when Notion is unavailable', async t => {
  const { url } = await receiver(t, { checkReady: async () => { throw new Error('unavailable'); } });
  const response = await fetch(`${url}/healthz`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, 'not_ready');
});

function notionDouble(types = {}) {
  const properties = Object.fromEntries(Object.entries({ order_id: 'title', commission_fee: 'rich_text',
    currency: 'rich_text', tracking_id: 'rich_text', timestamp: 'rich_text', ...types })
    .map(([name, type]) => [name, { type, ...(type === 'select' ? { select: { options: [{ name: 'USD' }] } } : {}) }]));
  const pages = [];
  const calls = { created: 0, updated: 0 };
  const typed = fields => Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { type: Object.keys(value)[0], ...value }]));
  const client = {
    databases: { retrieve: async () => ({ properties }), query: async ({ filter }) => {
      const id = filter.title?.equals ?? filter.rich_text?.equals;
      return { results: pages.filter(page => {
        const property = page.properties.order_id;
        return property[property.type].map(x => x.text.content).join('') === id;
      }) };
    } },
    pages: {
      create: async ({ properties: fields }) => {
        // Yield to expose query/create races in concurrent request tests.
        await new Promise(resolve => setImmediate(resolve));
        const page = { id: `page-${pages.length}`, properties: typed(fields) };
        pages.push(page); calls.created++; return page;
      },
      update: async ({ page_id, properties: fields }) => {
        const page = pages.find(page => page.id === page_id);
        Object.assign(page.properties, typed(fields)); calls.updated++; return page;
      },
    },
  };
  return { client, pages, calls };
}
test('concurrent retries and a fresh receiver do not insert duplicate pages', async () => {
  const { client, pages, calls } = notionDouble();
  const store = createNotionStore({ client, databaseId: 'test-db' });
  assert.deepEqual(await Promise.all([store.save(order), store.save(order)]), ['created', 'duplicate']);
  const restarted = createNotionStore({ client, databaseId: 'test-db' });
  assert.equal(await restarted.save(order), 'duplicate');
  assert.equal(calls.created, 1);
  assert.equal(pages.length, 1);
});
test('conflicting callbacks cannot overwrite an existing page', async () => {
  const { client, pages, calls } = notionDouble();
  const store = createNotionStore({ client, databaseId: 'test-db' });
  await store.save(order);
  const { tracking_id, ...withoutTracking } = order;
  await assert.rejects(store.save({ ...withoutTracking, commission_fee: '0.50' }), { code: 'conflicting_existing_order' });
  assert.equal(pages[0].properties.tracking_id.rich_text[0].text.content, tracking_id);
  assert.equal(calls.created, 1);
  assert.equal(calls.updated, 0);
});
test('number, select and date properties are encoded according to the existing schema', async () => {
  const { client, pages } = notionDouble({ commission_fee: 'number', currency: 'select', timestamp: 'date' });
  const store = createNotionStore({ client, databaseId: 'test-db' });
  await store.save(order);
  assert.equal(pages[0].properties.commission_fee.number, 0.25);
  assert.deepEqual(pages[0].properties.currency.select, { name: 'USD' });
  assert.ok(pages[0].properties.timestamp.date.start);
  assert.equal(await store.save(order), 'duplicate');
});
test('incompatible schemas and ambiguous existing orders never overwrite data', async () => {
  const bad = notionDouble({ commission_fee: 'checkbox' });
  await assert.rejects(createNotionStore({ client: bad.client, databaseId: 'test-db' }).save(order), { code: 'invalid_notion_property_commission_fee' });
  assert.equal(bad.calls.created, 0);
  const existing = notionDouble();
  const store = createNotionStore({ client: existing.client, databaseId: 'test-db' });
  await store.save(order);
  existing.pages.push({ ...existing.pages[0], id: 'preexisting-duplicate' });
  await assert.rejects(createNotionStore({ client: existing.client, databaseId: 'test-db' }).save(order), { code: 'ambiguous_existing_order' });
  assert.equal(existing.calls.updated, 0);
});
test('an uncertain create is not repeated until its committed page becomes visible', async () => {
  const { client, calls } = notionDouble();
  const create = client.pages.create;
  const query = client.databases.query;
  let hidden = true;
  client.databases.query = async args => hidden ? { results: [] } : query(args);
  client.pages.create = async args => { await create(args); throw new Error('response lost'); };
  const store = createNotionStore({ client, databaseId: 'test-db' });
  await assert.rejects(store.save(order), /response lost/);
  await assert.rejects(store.save(order), { code: 'uncertain_previous_write' });
  hidden = false;
  assert.equal(await store.save(order), 'duplicate');
  assert.equal(calls.created, 1);
});
test('a successful create receipt handles temporarily stale query results', async () => {
  const { client, calls } = notionDouble();
  client.databases.query = async () => ({ results: [] });
  const store = createNotionStore({ client, databaseId: 'test-db' });
  assert.equal(await store.save(order), 'created');
  assert.equal(await store.save(order), 'duplicate');
  assert.equal(calls.created, 1);
});
test('unknown select options cannot change the database schema', async () => {
  const { client, calls } = notionDouble({ currency: 'select' });
  const store = createNotionStore({ client, databaseId: 'test-db' });
  await assert.rejects(store.save({ ...order, currency: 'NEW' }), { code: 'unknown_notion_currency_option' });
  assert.equal(calls.created, 0);
});
test('definitive API rejection allows a later successful retry', async () => {
  const { client, calls } = notionDouble();
  const create = client.pages.create;
  let rejected = false;
  client.pages.create = async args => {
    if (!rejected) { rejected = true; throw Object.assign(new Error('rate limited'), { status: 429 }); }
    return create(args);
  };
  const store = createNotionStore({ client, databaseId: 'test-db' });
  await assert.rejects(store.save(order), /rate limited/);
  assert.equal(await store.save(order), 'created');
  assert.equal(calls.created, 1);
});
test('receipt comparison follows persisted number and optional tracking semantics', async () => {
  const { client, calls } = notionDouble({ commission_fee: 'number' });
  const store = createNotionStore({ client, databaseId: 'test-db' });
  const { tracking_id, ...withoutTracking } = order;
  await store.save(withoutTracking);
  assert.equal(await store.save({ ...withoutTracking, tracking_id: '', commission_fee: '0.250' }), 'duplicate');
  assert.equal(calls.created, 1);
});
