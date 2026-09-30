const { Client, LogLevel } = require('@notionhq/client');

function storageError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createNotionStore({ token = process.env.NOTION_TOKEN,
  databaseId = process.env.NOTION_DATABASE_ID, client } = {}) {
  const notion = client || new Client({ auth: token, timeoutMs: 10000,
    logLevel: LogLevel.ERROR, logger: () => {}, notionVersion: '2022-06-28' });
  const pending = new Map();
  const receipts = new Map();
  const receiptLimit = 1000;
  const supported = {
    order_id: ['title', 'rich_text'], commission_fee: ['rich_text', 'number'],
    currency: ['rich_text', 'select'], tracking_id: ['rich_text'], timestamp: ['rich_text', 'date'],
  };
  async function checkReady() {
    if (!databaseId || (!client && !token)) throw storageError('missing_notion_configuration');
    const database = await notion.databases.retrieve({ database_id: databaseId });
    for (const [name, types] of Object.entries(supported)) {
      if (!types.includes(database.properties?.[name]?.type)) {
        throw storageError(`invalid_notion_property_${name}`);
      }
    }
    return database.properties;
  }
  function property(name, value, schema) {
    const type = schema[name].type;
    if (type === 'number') return { number: Number(value) };
    if (type === 'date') return { date: { start: value } };
    if (type === 'select') {
      if (!schema[name].select.options.some(option => option.name === value)) {
        throw storageError('unknown_notion_currency_option');
      }
      return { select: { name: value } };
    }
    return { [type]: value ? [{ text: { content: value } }] : [] };
  }
  function readProperty(value) {
    if (value.type === 'number') return String(value.number);
    if (value.type === 'select') return value.select?.name || '';
    return (value[value.type] || []).map(item => item.plain_text ?? item.text?.content ?? '').join('');
  }
  function matchesReceipt(receipt, order) {
    return Object.entries(order).every(([name, value]) =>
      name === 'commission_fee' && receipt.numericCommission
        ? Number(value) === Number(receipt.values[name]) : value === receipt.values[name]);
  }
  async function saveOrder(order) {
    const receipt = receipts.get(order.order_id);
    if (receipt?.confirmed) {
      if (!matchesReceipt(receipt, order)) throw storageError('conflicting_existing_order');
      return 'duplicate';
    }
    const schema = await checkReady();
    const type = schema.order_id.type;
    const existing = await notion.databases.query({ database_id: databaseId, page_size: 2,
      filter: { property: 'order_id', [type]: { equals: order.order_id } } });
    if (existing.results.length > 1) throw storageError('ambiguous_existing_order');
    const page = existing.results[0];
    const unchanged = page && Object.keys(order).every(name => {
      const stored = page.properties[name];
      if (!stored) return false;
      return stored.type === 'number' ? stored.number === Number(order[name]) : readProperty(stored) === order[name];
    });
    if (unchanged) {
      if (receipt) receipt.confirmed = true;
      return 'duplicate';
    }
    // The public callback is not authenticated. Never let a caller overwrite an order.
    if (page) throw storageError('conflicting_existing_order');
    // A timed-out create may already have committed. Do not blindly create it again.
    if (receipt) throw storageError('uncertain_previous_write');
    const properties = {};
    for (const [name, value] of Object.entries(order)) properties[name] = property(name, value, schema);
    properties.timestamp = property('timestamp', new Date().toISOString(), schema);
    if (order.tracking_id === undefined) properties.tracking_id = property('tracking_id', '', schema);
    if (receipts.size >= receiptLimit) {
      const confirmed = [...receipts].find(([, value]) => value.confirmed);
      if (!confirmed) throw storageError('unresolved_write_limit');
      receipts.delete(confirmed[0]);
    }
    const current = { values: { tracking_id: '', ...order },
      numericCommission: schema.commission_fee.type === 'number', confirmed: false };
    receipts.set(order.order_id, current);
    try {
      await notion.pages.create({ parent: { database_id: databaseId }, properties });
    } catch (error) {
      // These API responses definitively reject the request, so a later retry is safe.
      if ([400, 401, 403, 404, 429].includes(error.status)) receipts.delete(order.order_id);
      throw error;
    }
    current.confirmed = true;
    return 'created';
  }
  function save(order) {
    // Serialize one order's query/create operations on the existing single instance.
    const previous = pending.get(order.order_id) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => saveOrder(order));
    pending.set(order.order_id, operation);
    return operation.finally(() => {
      if (pending.get(order.order_id) === operation) pending.delete(order.order_id);
    });
  }
  return { save, checkReady };
}
module.exports = { createNotionStore };
