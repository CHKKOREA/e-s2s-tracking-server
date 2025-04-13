const { google } = require('googleapis');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
  keyFile: './extreme-hull-456718-i1-6bb8509e66fc.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function appendToSheet(row) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

const spreadsheetId = '1MoAf3D0hGeGJYGyGQ3339AxlupLaf_pI1hDYWsBmwj8';
const RANGE = 'AliExpress!A1:E';

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [row],
    },
  });
}

module.exports = appendToSheet;