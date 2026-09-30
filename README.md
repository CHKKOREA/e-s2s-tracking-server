# AliExpress S2S receiver

Both `/` and `/order-s2s` accept GET query parameters, POST URL-encoded forms,
and POST JSON: `order_id`, `commission_fee`, `currency`,
and optional `tracking_id`. Currency and commission stay in the units supplied
by AliExpress; no Dollar/Cent conversion is inferred.

Orders are saved to the existing Notion database before HTTP 200 `OK` is returned.
Storage failures return 503. Repeated identical orders do not insert another page;
conflicting values and ambiguous existing duplicates return 409 without changing
existing orders. The public callback does not authenticate AliExpress, so it must
not update existing orders. Successful/uncertain create receipts protect retries
inside one instance even if Notion query indexing lags. A fresh process checks
Notion for existing orders; this is not a durable exactly-once guarantee across
crashes. Use a database unique constraint before scaling to multiple instances.

Set `NOTION_TOKEN` and `NOTION_DATABASE_ID` in Render's environment, never in Git.
The integration needs database access and read/insert content capabilities.
The following property names and types are supported:

| Property | Type |
| --- | --- |
| order_id | Title or rich text |
| commission_fee | Rich text or number |
| currency | Rich text or select |
| tracking_id | Rich text |
| timestamp | Rich text or date |

`GET /healthz` returns 200 after checking Notion access and schema. A bare
`GET /order-s2s` returns `GET OK` as a reachability probe and creates no order.
A bare `GET /` keeps the server-status response used by Render health checks;
root GET requests with query parameters enter the same order receiver as `/order-s2s`.
The portal preview GET on either path with exactly `currency=currency`, `order_id=order_id`,
`commission_fee=commission_fee`, and `tracking_id=tracking_id` is also a
reachability probe. It returns `GET OK`, logs `s2s_preview_probe`, and never saves
the placeholders. Mixed or incomplete placeholder payloads remain invalid.
That probe alone does not verify callbacks or Notion writes. Logs contain event
names and safe error codes, not payloads or credentials.
HTTP diagnostics record arrival, method, a fixed route category, response status,
and duration, including unsupported methods and paths. Raw paths, query strings,
request bodies, headers, and credentials are excluded.
Select currencies must already exist in the database options; the receiver does
not create options or alter the schema. Uncertain writes return 503 until the
existing page becomes visible; inspect Notion before attempting manual recovery.

Run `npm ci` and `npm test` with Node.js 18 or newer. Local tests use isolated
test doubles; deployment acceptance additionally requires a clearly labeled real
test order saved to Notion, retransmission without duplication, and an AliExpress
portal test. Render Free can sleep when idle.
