const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function appendToNotion(row) {
  await notion.pages.create({
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      order_id: {
        title: [
          {
            text: {
              content: row[0],
            },
          },
        ],
      },
      commission_fee: {
        rich_text: [
          {
            text: {
              content: row[1],
            },
          },
        ],
      },
      currency: {
        rich_text: [
          {
            text: {
              content: row[2],
            },
          },
        ],
      },
      tracking_id: {
        rich_text: [
          {
            text: {
              content: row[3],
            },
          },
        ],
      },
      timestamp: {
        rich_text: [
          {
            text: {
              content: row[4],
            },
          },
        ],
      },
    },
  });
}

module.exports = appendToNotion;
