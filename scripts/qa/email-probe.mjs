/*
 * Verifies the order-confirmation e-mail template and the notify route's guards.
 *
 *   node scripts/qa/email-probe.mjs          # expects a server on :3000
 *
 * The template assertions need to render an e-mail without sending one, so the
 * probe calls a throwaway preview route that is deliberately NOT part of the
 * shipped app. Drop one in for the run, then delete it:
 *
 *   - create  app/api/qa-preview/email-preview/route.ts
 *   - it should return 404 unless the query string carries
 *     `key=qa-preview-7f3a91c4`, otherwise render
 *     `orderConfirmationEmail(fixture, { recipientName })` from
 *     '@/lib/email/order-confirmation' as text/html, and echo the subject in an
 *     `x-qa-subject` header (`?format=text` returns the plain-text alternative)
 *   - delete the route when the run is over
 *
 * Watch the folder name: `_qa` would be a Next.js *private folder* and never
 * route at all. Run this probe against a `next dev` server — the route needs to
 * exist at request time, and a production build would bake it in.
 */
const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3000';
const KEY = process.env.PROBE_KEY ?? 'qa-preview-7f3a91c4';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const preview = (qs) => fetch(`${BASE}/api/qa-preview/email-preview?key=${KEY}&${qs}`);

// wait for the dev server to compile the new route
let cod;
for (let i = 0; i < 40; i++) {
  cod = await preview('variant=cod');
  if (cod.status === 200) break;
  await new Promise((r) => setTimeout(r, 1500));
}
const codHtml = await cod.text();
const subject = cod.headers.get('x-qa-subject');

check('preview route compiled and renders', cod.status === 200 && codHtml.length > 1000, `${codHtml.length} bytes`);
check('subject names the order and the shop',
  subject === 'Your Nexus Commerce order #A1B2C3D4 is confirmed', subject);
check('COD total reads as due on delivery', codHtml.includes('Total (due on delivery)'));
check('grand total rendered in BDT', /৳\s?124/.test(codHtml), '৳ 124');
check('delivery charge line rendered', /৳\s?60/.test(codHtml), '৳ 60');
check('delivery area named', codHtml.includes('Delivery (Inside Dhaka)'));
check('items subtotal is total minus the fee', /৳\s?64/.test(codHtml), '৳ 64');
check('line item shows qty × unit price', /2 × ৳\s?32/.test(codHtml), '2 × ৳ 32');
check('payment method named', codHtml.includes('Cash on delivery'));
check('delivery address rendered with line breaks',
  codHtml.includes('Hemayetpur, Savar<br />Dhaka 1340'));
check('phone rendered', codHtml.includes('01934100750'));
check('shopper note rendered', codHtml.includes('Please call before delivery'));
check('tracking button points at the order page',
  codHtml.includes('http://localhost:3000/orders/a1b2c3d4-1111-4222-8333-444455556666'),
  'order url present');
check('HTML injection in the name/address is escaped',
  codHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !codHtml.includes('<script>alert(1)'),
  'script tag neutralised');
check('note markup is escaped, not interpreted',
  codHtml.includes('Please call before delivery &lt;b&gt;thanks&lt;/b&gt;') && !codHtml.includes('<b>thanks</b>'));
check('ampersand escaped', codHtml.includes('&amp; Co.'));
check('support e-mail and address in the footer',
  codHtml.includes('support@nexuscommerce.dev') && codHtml.includes('Hemayetpur, Savar, Dhaka'));
check('preheader present', codHtml.includes('display:none'), 'hidden preheader');

const bkash = await (await preview('variant=bkash')).text();
check('bKash variant shows the TrxID', bkash.includes('TrxID 8N7A2K9QZ1'));
check('bKash variant shows the verification status',
  /Awaiting review/i.test(bkash), (bkash.match(/bKash \(Send Money\)[^<]*/) ?? [''])[0].trim());
check('bKash total is marked paid', bkash.includes('Total paid'));
check('bKash names the Send Money method', bkash.includes('bKash (Send Money)'));

const text = await (await preview('format=text&variant=cod')).text();
check('plain-text alternative carries the numbers',
  /Items:\s+৳\s?64/.test(text) && /Delivery \(Inside Dhaka\):\s+৳\s?60/.test(text) && /Total:\s+৳\s?124/.test(text),
  text.split('\n').find((l) => l.startsWith('Total:')));

// ------------------------------------------------------------------ route -----
const post = (path) => fetch(`${BASE}${path}`, { method: 'POST', redirect: 'manual' });
const bad = await post('/api/orders/not-a-uuid/notify');
check('malformed order id → 400', bad.status === 400, `${bad.status} ${await bad.text()}`);

const anon = await post('/api/orders/a1b2c3d4-1111-4222-8333-444455556666/notify');
check('no session → 401 AUTH_REQUIRED', anon.status === 401 && (await anon.text()).includes('AUTH_REQUIRED'), `${anon.status}`);

const unknown = await post('/api/orders/11111111-2222-4333-8444-555555555555/notify');
check('unknown order id stays auth-gated (no existence leak)', unknown.status === 401, `${unknown.status}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== e-mail probe: ${results.length - failed}/${results.length} passed ===`);
process.exit(failed === 0 ? 0 : 1);
