const { google } = require('googleapis');
const path = require('path');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'extreme-hull-456718-i1-6bb8509e66fc.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SHEET_ID = '1pgta-Nk81qvSmz-H_qSFsL_oaWW_trCDnxJwl8A8J1o';
const RANGE = `'알리익스프레스'!A1`;

async function appendToSheet(rowData) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: {
      values: [rowData],
    },
  });
}

module.exports = appendToSheet;
