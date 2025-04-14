const { Client } = require('@notionhq/client');

// 환경변수에서 토큰과 DB ID 가져오기
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function appendToNotion(row) {
  const [order_id, commission_fee, currency, tracking_id, timestamp] = row;

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      order_id: {
        title: [{ text: { content: order_id } }],
      },
      commission_fee: {
        number: parseFloat(commission_fee),
      },
      currency: {
        rich_text: [{ text: { content: currency } }],
      },
      tracking_id: {
        rich_text: [{ text: { content: tracking_id } }],
      },
      timestamp: {
        date: { start: timestamp },
      },
    },
  });
}

module.exports = appendToNotion;
