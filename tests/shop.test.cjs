// The fake shop that end-to-end job tests run against (tests/fixtures/shop/server.cjs): its flows over HTTP, no browser.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startShop } = require('./fixtures/shop/server.cjs');

let shop;
before(async () => { shop = await startShop(0); });
after(() => shop.close());
beforeEach(() => shop.reset());
const get = async path => { const r = await fetch(shop.url + path); return { status: r.status, path: new URL(r.url).pathname + new URL(r.url).search, html: await r.text() }; };
const post = async (path, form) => {
  const r = await fetch(shop.url + path, { method: 'POST', body: new URLSearchParams(form), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  return { status: r.status, path: new URL(r.url).pathname + new URL(r.url).search, html: await r.text() };
};
const sku = (id, pack, flavour) => [id, pack, flavour].filter(Boolean).join('~');
const whey60 = sku('sunfold-whey', '60-sachets', 'unflavoured');
const address = { name: 'Asha Rao', phone: '98765 43210', pincode: '411045', line1: 'Flat 4B, Lotus Court', line2: 'Baner Road', landmark: '', city: 'Pune', state: 'Maharashtra' };
async function toPayment() {
  await post('/cart/add', { sku: whey60 });
  await post('/login', { next: '/checkout', user: 'asha@example.com', password: 'secret' });
  await post('/checkout/address', address);
  return post('/checkout/delivery', { slot: 'standard' });
}

test('first visit asks for a pincode in a modal; applying or skipping it stops asking', async () => {
  let home = await get('/');
  assert.match(home.html, /<dialog id="pin"[\s\S]*Where should we deliver\?[\s\S]*showModal/);
  assert.match(home.html, /Select delivery location/);
  const bad = await post('/pincode', { pincode: '12', back: '/' });
  assert.match(bad.html, /valid 6-digit pincode/);
  const applied = await post('/pincode', { pincode: '411045', back: '/search?q=protein' });
  assert.equal(applied.path, '/search?q=protein');
  assert.doesNotMatch(applied.html, /<dialog/); assert.match(applied.html, /Deliver to 411045/);
  shop.reset();
  assert.doesNotMatch((await post('/pincode', { pincode: '', skip: '1', back: '/' })).html, /<dialog/);
});

test('a protein search is busy like a real one: sponsored first, filters, many results, pages', async () => {
  const { html } = await get('/search?q=whey+protein');
  const names = [...html.matchAll(/<a href="\/p\/[^"]+">([^<]+)<\/a>/g)].map(m => m[1]);
  assert.ok(html.indexOf('Sponsored') < html.indexOf('Sunfold Whey Protein, 15 sachets'), 'sponsored results come first');
  assert.ok(names.includes('Sunfold Whey Protein, 15 sachets') && names.includes('Sunfold Whey Protein Isolate, 30 sachets'), names.join(' | '));
  assert.equal(names.length, 16, 'one page of results');
  assert.ok((html.match(/type="checkbox"/g) ?? []).length >= 25, 'a filter sidebar of checkboxes precedes the grid');
  assert.ok(html.indexOf('aria-label="Filters"') < html.indexOf('class="grid"'));
  assert.match(html, /aria-label="Pages"[\s\S]*>Next</);
  const filtered = await get('/search?q=protein&brand=Sunfold');
  assert.ok([...filtered.html.matchAll(/<a href="\/p\/([^"]+)">/g)].every(m => m[1].startsWith('sunfold-')));
  assert.match((await get('/search?q=zzzz')).html, /No products match/);
});

test('variants: pack size and flavour radios, prices per pack, one combination out of stock', async () => {
  let page = await get('/p/sunfold-whey');
  assert.match(page.html, /₹599/); assert.match(page.html, /type="radio" name="pack" value="60-sachets"/);
  page = await get('/p/sunfold-whey?pack=60-sachets&flavour=unflavoured');
  assert.match(page.html, /class="price">₹2,149/); assert.match(page.html, />Add to cart</); assert.match(page.html, />Buy now</);
  page = await get('/p/sunfold-whey?pack=60-sachets&flavour=chocolate');
  assert.match(page.html, /Currently unavailable/); assert.doesNotMatch(page.html, /name="sku" value="sunfold-whey~60-sachets~chocolate"/);
  assert.equal((await post('/cart/add', { sku: sku('sunfold-whey', '60-sachets', 'chocolate') })).status, 400);
  assert.equal((await post('/cart/add', { sku: 'nope~1' })).status, 400);
  assert.deepEqual(shop.state().cart, []);
});

test('cart: add from a product page, merge, change quantity, remove', async () => {
  const added = await post('/cart/add', { sku: whey60, qty: '1', back: '/p/sunfold-whey?pack=60-sachets&flavour=unflavoured&added=1' });
  assert.match(added.html, /Added to cart:<\/strong> Sunfold Whey Protein, 60 sachets, Unflavoured/);
  assert.match(added.html, /aria-label="Cart, 1 items"/);
  await post('/cart/add', { sku: whey60, qty: '2' });
  assert.equal(shop.state().cart[0].qty, 3);
  await post('/cart/update', { sku: whey60, qty: '1' });
  const cart = await get('/cart');
  assert.match(cart.html, /Subtotal \(1 item\): <span class="price">₹2,149/); assert.match(cart.html, />Proceed to checkout</);
  await post('/cart/update', { sku: whey60, qty: '0' });
  assert.match((await get('/cart')).html, /Your cart is empty/);
  assert.equal((await post('/checkout', {})).path, '/cart', 'an empty cart cannot check out');
});

test('checkout: login wall, address validation, delivery, payment with a bare "Continue", review, cash on delivery', async () => {
  await post('/cart/add', { sku: whey60 });
  const wall = await post('/checkout', {});
  assert.equal(wall.path, '/login?next=/checkout'); assert.match(wall.html, /type="password"/); assert.match(wall.html, /Get an OTP instead/);
  assert.match((await post('/login', { next: '/checkout', user: 'asha@example.com', password: '' })).html, /role="alert"/);
  const signedIn = await post('/login', { next: '/checkout', user: 'asha@example.com', password: 'secret' });
  assert.equal(signedIn.path, '/checkout/address');
  const invalid = await post('/checkout/address', { ...address, phone: '123', state: '' });
  assert.match(invalid.html, /10-digit mobile number/); assert.match(invalid.html, /Choose a state/); assert.match(invalid.html, /value="Asha Rao"/);
  const delivery = await post('/checkout/address', address);
  assert.equal(delivery.path, '/checkout/delivery'); assert.match(delivery.html, /Delivering to Asha Rao, Pune 411045/);
  const payment = await post('/checkout/delivery', { slot: 'express' });
  assert.equal(payment.path, '/checkout/payment');
  assert.match(payment.html, /Order total: <span class="price">₹2,198/);
  assert.match(payment.html, /<button class="primary">Continue<\/button>/, 'the payment page’s button only says Continue');
  const review = await post('/checkout/payment', { payment: 'cod' });
  assert.equal(review.path, '/checkout/review');
  assert.match(review.html, /Order total: ₹2,198/); assert.match(review.html, />Place order</); assert.match(review.html, /Cash on delivery/);
  const placed = await post('/checkout/place', {});
  assert.match(placed.path, /^\/order\/KTM-\d{6}$/); assert.match(placed.html, /Order placed, thank you!/); assert.match(placed.html, /Order number <strong>KTM-\d{6}/);
  const state = shop.state();
  assert.equal(state.orders[0].status, 'placed'); assert.equal(state.orders[0].total, 2198); assert.deepEqual(state.cart, []);
  assert.match((await get('/orders')).html, /Sunfold Whey Protein, 60 sachets, Unflavoured/);
  // A second order reuses the saved address.
  await post('/cart/add', { sku: whey60 }); await post('/checkout', {});
  assert.match((await get('/checkout/address')).html, /Saved addresses[\s\S]*Deliver to this address/);
  assert.equal((await post('/checkout/address', { saved: '0' })).path, '/checkout/delivery');
});

test('UPI waits for the shopper to approve elsewhere; nothing is placed until then', async () => {
  await toPayment(); await post('/checkout/payment', { payment: 'upi' });
  const pending = await post('/checkout/place', {});
  assert.match(pending.html, /Approve the payment request in your UPI app/); assert.match(pending.html, /http-equiv="refresh"/);
  const id = pending.path.slice('/order/'.length);
  assert.equal(shop.state().orders[0].status, 'pending'); assert.equal(shop.state().cart.length, 1);
  assert.doesNotMatch((await get('/orders')).html, new RegExp(id));
  assert.equal((await fetch(`${shop.url}/__/pay/${id}`, { method: 'POST' })).status, 200);
  assert.match((await get(`/order/${id}`)).html, /Order placed, thank you!/);
  assert.equal(shop.state().cart.length, 0);
  assert.equal((await fetch(`${shop.url}/__/pay/${id}`, { method: 'POST' })).status, 404, 'a payment is approved once');
});

test('cards need a number and CVV; cash on delivery is refused above the limit', async () => {
  await toPayment();
  const chooseCard = await post('/checkout/payment?choose=1', { payment: 'card' });
  assert.match(chooseCard.html, /Card number[\s\S]*name="cvv"/); assert.match(chooseCard.html, /type="password" name="cvv"/);
  assert.match((await post('/checkout/payment', { payment: 'card', card: '', cvv: '' })).html, /Enter your card number and CVV/);
  assert.equal((await post('/checkout/payment', { payment: 'card', card: '4111 1111 1111 1111', expiry: '12/29', cvv: '123' })).path, '/checkout/review');
  assert.match((await post('/checkout/place', {})).html, /OTP sent to your phone/);
  shop.reset({ signedIn: true, pincode: '411045' });
  await post('/cart/add', { sku: whey60, qty: '3' }); await post('/checkout/address', address); await post('/checkout/delivery', { slot: 'standard' });
  assert.match((await get('/checkout/payment')).html, /value="cod"[^>]* disabled> Cash on delivery \(not available above ₹5,000\)/);
  assert.match((await post('/checkout/payment', { payment: 'cod' })).html, /Choose a payment method/);
});

test('steps cannot be skipped, test hooks are never linked, and reset options apply', async () => {
  shop.reset({ signedIn: true, pincode: '411045', loginWall: false });
  await post('/cart/add', { sku: whey60 });
  assert.equal((await get('/checkout/review')).path, '/checkout/address');
  for (const path of ['/', '/search?q=protein', '/p/sunfold-whey', '/cart', '/checkout/address', '/login']) assert.doesNotMatch((await get(path)).html, /\/__\//, path);
  assert.doesNotMatch((await get('/')).html, /<dialog/, 'a saved pincode means no prompt');
  await fetch(`${shop.url}/__/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pincodePrompt: false }) });
  assert.equal(shop.state().pincode, null); assert.doesNotMatch((await get('/')).html, /<dialog/);
});
