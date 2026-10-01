// Kite Test Mart: a local, fictional online store that end-to-end job tests run against (docs/end-to-end-jobs.md
// phase 0). No automated test ever touches a real checkout. Server-rendered pages with forms, like many real stores,
// plus the parts that make real errands hard: a pincode prompt, a busy header and filter sidebar, sponsored results,
// variants (one out of stock), a login wall, an address form, delivery slots, a payment page whose button only says
// "Continue", "Place order", a payment that the user approves elsewhere, and an order confirmation.
//
// One shopper, global state. Test-only endpoints live under /__/ and are never linked from pages:
//   GET  /__/state          the whole state as JSON
//   POST /__/reset          reset; JSON body may set { pincode, signedIn, loginWall, pincodePrompt, addresses }
//   POST /__/pay/<order>    the shopper approves a pending payment (UPI, card OTP, net banking)
// Run alone: node tests/fixtures/shop/server.cjs [port]
const http = require('node:http');
const { URL } = require('node:url');

const flavours = ['Unflavoured', 'Chocolate', 'Kesar Pista'];
// The products of the Amul scenario are here under a fictional brand; everything else fills search results the
// way a real store does. Prices are in rupees.
const products = [
  { id: 'sunfold-whey', name: 'Sunfold Whey Protein', brand: 'Sunfold', category: 'Protein', rating: 4.4, reviews: 3812,
    packs: [{ size: '15 sachets', price: 599 }, { size: '30 sachets', price: 1149 }, { size: '60 sachets', price: 2149 }], flavours,
    soldOut: ['60 sachets/Chocolate'], about: 'Each 32 g sachet has 25 g of whey protein. Made from cow milk.' },
  { id: 'sunfold-isolate', name: 'Sunfold Whey Protein Isolate', brand: 'Sunfold', category: 'Protein', rating: 4.5, reviews: 921,
    packs: [{ size: '30 sachets', price: 1499 }, { size: '60 sachets', price: 2899 }], flavours: ['Unflavoured', 'Chocolate'], about: '27 g protein per sachet, low lactose.' },
  { id: 'sunfold-bar', name: 'Sunfold Protein Bar', brand: 'Sunfold', category: 'Protein', rating: 4.1, reviews: 2204,
    packs: [{ size: 'Pack of 6', price: 360 }, { size: 'Pack of 12', price: 699 }], flavours: ['Chocolate', 'Peanut Butter'], about: '20 g protein per bar.' },
  { id: 'sunfold-lassi', name: 'Sunfold High Protein Lassi', brand: 'Sunfold', category: 'Protein', rating: 4.3, reviews: 5120,
    packs: [{ size: 'Pack of 6 × 200 ml', price: 300 }, { size: 'Pack of 30 × 200 ml', price: 1440 }], flavours: [], about: '15 g protein per bottle.' },
  { id: 'musclemax-whey', name: 'MuscleMax Whey 1 kg', brand: 'MuscleMax', category: 'Protein', rating: 4.0, reviews: 12093, sponsored: true,
    packs: [{ size: '1 kg tub', price: 2499 }, { size: '2 kg tub', price: 4599 }], flavours: ['Chocolate', 'Vanilla'], about: '24 g protein per scoop.' },
  { id: 'purely-plant', name: 'Purely Plant Protein', brand: 'Purely', category: 'Protein', rating: 4.2, reviews: 811,
    packs: [{ size: '500 g', price: 1299 }, { size: '1 kg', price: 2399 }], flavours: ['Unflavoured', 'Chocolate'], about: 'Pea and brown rice protein.' },
  { id: 'nutricore-whey', name: 'NutriCore Whey 2 kg', brand: 'NutriCore', category: 'Protein', rating: 3.9, reviews: 4410, sponsored: true,
    packs: [{ size: '2 kg tub', price: 3999 }], flavours: ['Chocolate', 'Cookies and Cream'], about: '24 g protein per scoop.' },
  { id: 'voltcell-aa', name: 'VoltCell AA Batteries', brand: 'VoltCell', category: 'Electronics', rating: 4.5, reviews: 20831,
    packs: [{ size: 'Pack of 4', price: 120 }, { size: 'Pack of 10', price: 280 }, { size: 'Pack of 20', price: 520 }], flavours: [], about: 'Alkaline, 1.5 V.' },
  { id: 'royal-basmati', name: 'Royal Grain Basmati Rice', brand: 'Royal Grain', category: 'Grocery', rating: 4.3, reviews: 7820,
    packs: [{ size: '1 kg', price: 189 }, { size: '5 kg', price: 849 }], flavours: [], about: 'Aged two years.' },
  { id: 'sunfold-butter', name: 'Sunfold Butter', brand: 'Sunfold', category: 'Dairy', rating: 4.7, reviews: 30211,
    packs: [{ size: '100 g', price: 58 }, { size: '500 g', price: 275 }], flavours: [], about: 'Pasteurised, salted.' },
];
// Filler that makes a protein search look like a real one: 18 more products across brands.
for (const [i, brand] of ['FitFuel', 'Proteo', 'MuscleMax', 'Purely', 'NutriCore', 'Gainz'].entries())
  for (const [j, kind] of ['Whey Protein', 'Mass Gainer', 'Protein Cookies'].entries())
    products.push({ id: `${brand.toLowerCase()}-${kind.toLowerCase().replace(/\s+/g, '-')}`, name: `${brand} ${kind}`, brand, category: 'Protein',
      rating: 3.6 + ((i + j) % 5) / 5, reviews: 150 + i * 431 + j * 97, packs: [{ size: j === 2 ? 'Pack of 10' : '1 kg', price: 899 + i * 120 + j * 210 }],
      flavours: j === 2 ? [] : ['Chocolate', 'Vanilla'], about: 'Popular with gym-goers.' });

const categories = ['Protein', 'Dairy', 'Grocery', 'Snacks', 'Beverages', 'Personal care', 'Baby care', 'Home', 'Kitchen', 'Electronics', 'Fashion', 'Books', 'Toys', 'Offers'];
const footer = { 'About': ['About us', 'Careers', 'Press', 'Blog', 'Sustainability', 'Investors', 'Stores near you'],
  'Help': ['Payments', 'Shipping', 'Cancellations and returns', 'FAQ', 'Report a problem', 'Contact us', 'Track your order'],
  'Policy': ['Return policy', 'Terms of use', 'Security', 'Privacy', 'Sitemap', 'Grievance redressal', 'Cookie settings'],
  'Sell with us': ['Become a seller', 'Advertise', 'Affiliate programme', 'Brand registry', 'Seller help', 'Logistics', 'Supplier portal'],
  'Popular': ['Whey protein', 'Peanut butter', 'Green tea', 'Oats', 'Multivitamins', 'Dark chocolate', 'Muesli'],
  'Follow us': ['Facebook', 'Instagram', 'YouTube', 'X', 'LinkedIn', 'WhatsApp updates', 'App download'] };
const states = ['Andhra Pradesh', 'Delhi', 'Goa', 'Gujarat', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];
const slots = [{ id: 'standard', label: 'Standard delivery', when: 'in 3 days', fee: 0 }, { id: 'express', label: 'Express delivery', when: 'tomorrow', fee: 49 },
  { id: 'scheduled', label: 'Scheduled slot, Saturday 9 am to 12 pm', when: 'on Saturday', fee: 29 }];
const payments = [{ id: 'upi', label: 'UPI' }, { id: 'card', label: 'Credit or debit card' }, { id: 'netbanking', label: 'Net banking' }, { id: 'cod', label: 'Cash on delivery' }];
const codLimit = 5000;

const fresh = (options = {}) => ({
  pincode: options.pincode ?? null, signedIn: options.signedIn ?? false, loginWall: options.loginWall ?? true, pincodePrompt: options.pincodePrompt ?? true,
  cart: [], addresses: options.addresses ?? [], address: null, slot: null, payment: null, orders: [], visits: [], next: 1,
});
let state = fresh();

const rupees = n => '₹' + n.toLocaleString('en-IN');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const product = id => products.find(p => p.id === id);
const skuOf = (p, pack, flavour) => [p.id, slug(pack), flavour ? slug(flavour) : ''].filter(Boolean).join('~');
function parseSku(sku) {
  const [id, pack, flavour] = String(sku).split('~'), p = product(id);
  const chosen = p?.packs.find(k => slug(k.size) === pack), taste = flavour ? p?.flavours.find(f => slug(f) === flavour) : undefined;
  if (!p || !chosen || (p.flavours.length && !taste) || (!p.flavours.length && flavour)) return null;
  return { product: p, pack: chosen, flavour: taste ?? null, soldOut: (p.soldOut ?? []).includes(`${chosen.size}/${taste}`) };
}
const lineName = item => `${item.product.name}, ${item.pack.size}${item.flavour ? `, ${item.flavour}` : ''}`;
const cartLines = () => state.cart.map(line => ({ ...line, item: parseSku(line.sku) })).filter(line => line.item);
const cartCount = () => state.cart.reduce((n, line) => n + line.qty, 0);
function totals() {
  const items = cartLines().reduce((n, line) => n + line.item.pack.price * line.qty, 0);
  const delivery = state.slot ? slots.find(s => s.id === state.slot).fee : 0;
  return { items, delivery, total: items + delivery };
}
const mrp = price => Math.round(price * 1.18 / 10) * 10 - 1;

const style = `
*{box-sizing:border-box} body{margin:0;font:15px/1.45 "Segoe UI",system-ui,sans-serif;color:#1d2433;background:#f3f4f7}
a{color:#0b57d0} header.top{display:flex;align-items:center;gap:16px;padding:10px 24px;background:#16213e;color:#fff}
header.top a{color:#fff;text-decoration:none} .logo{font-weight:700;font-size:20px} .deliver{font-size:13px;opacity:.9}
form.search{flex:1;display:flex} form.search input{flex:1;padding:8px 10px;border:0;border-radius:6px 0 0 6px;font:inherit}
form.search button{padding:8px 14px;border:0;border-radius:0 6px 6px 0;background:#ffb703;font:inherit;font-weight:600}
nav.cats{display:flex;gap:18px;padding:8px 24px;background:#22305a;overflow:hidden} nav.cats a{color:#dfe6ff;text-decoration:none;font-size:14px;white-space:nowrap}
main{max-width:1240px;margin:16px auto;padding:0 16px} .layout{display:grid;grid-template-columns:230px 1fr;gap:16px}
aside.filters,.card{background:#fff;border-radius:10px;padding:14px 16px;box-shadow:0 1px 2px #0001}
aside.filters fieldset{border:0;padding:0;margin:0 0 12px} aside.filters legend{font-weight:600;margin-bottom:4px} aside.filters label{display:block;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px} .tile{background:#fff;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px}
.tile .img{display:block;height:120px;border-radius:8px;background:linear-gradient(135deg,#ffe9b3,#cfe3ff)} .price{font-weight:700} .mrp{text-decoration:line-through;color:#6b7280;font-size:13px}
.sponsored{font-size:12px;color:#6b7280} button.primary,a.primary{padding:9px 14px;border:0;border-radius:8px;background:#ffb703;font:inherit;font-weight:600;color:#1d2433;cursor:pointer;text-decoration:none;display:inline-block}
button.secondary{padding:7px 12px;border:1px solid #c5cad3;border-radius:8px;background:#fff;font:inherit;cursor:pointer}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap} .muted{color:#6b7280} .error{color:#b42318} .stack>*+*{margin-top:12px}
footer{margin-top:32px;padding:24px;background:#16213e;color:#c9d2ea;display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
footer a{display:block;color:#c9d2ea;text-decoration:none;font-size:13px;line-height:1.9} footer h2{font-size:14px;color:#fff;margin:0 0 6px}
dialog{border:0;border-radius:12px;padding:20px 22px;box-shadow:0 10px 40px #0004} dialog::backdrop{background:#0006}
label.field{display:block;margin:8px 0} label.field input,label.field select{display:block;width:100%;max-width:360px;padding:7px 9px;border:1px solid #c5cad3;border-radius:6px;font:inherit}
.chips label{display:inline-block;margin:0 8px 8px 0;padding:6px 10px;border:1px solid #c5cad3;border-radius:8px;background:#fff} .chips input{margin-right:6px}
.pager{display:flex;gap:10px;margin-top:16px} table{border-collapse:collapse;width:100%} td,th{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}`;

function page(title, body, options = {}) {
  const prompt = state.pincodePrompt && !state.pincode && !options.noPrompt;
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${options.refresh ? `<meta http-equiv="refresh" content="${options.refresh}">` : ''}<title>${esc(title)} · Kite Test Mart</title><style>${style}</style></head><body>
<header class="top"><a class="logo" href="/">Kite Test Mart</a>
<a class="deliver" href="/pincode">${state.pincode ? `Deliver to ${esc(state.pincode)}` : 'Select delivery location'}</a>
<form class="search" action="/search" role="search"><input name="q" aria-label="Search for products" placeholder="Search for products, brands and more" value="${esc(options.query ?? '')}"><button>Search</button></form>
<a href="${state.signedIn ? '/orders' : '/login'}">${state.signedIn ? 'Your orders' : 'Sign in'}</a><a href="/cart" aria-label="Cart, ${cartCount()} items">Cart (${cartCount()})</a></header>
<nav class="cats" aria-label="Categories">${categories.map(c => `<a href="/search?q=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</nav>
<main>${body}</main>
<footer>${Object.entries(footer).map(([head, links]) => `<div><h2>${esc(head)}</h2>${links.map(l => `<a href="/info/${slug(l)}">${esc(l)}</a>`).join('')}</div>`).join('')}</footer>
${prompt ? `<dialog id="pin" aria-labelledby="pin-title"><h2 id="pin-title">Where should we deliver?</h2><p class="muted">Prices and delivery dates depend on your pincode.</p>
<form method="post" action="/pincode"><input type="hidden" name="back" value="${esc(options.path ?? '/')}"><label class="field">Pincode<input name="pincode" inputmode="numeric" autocomplete="postal-code"></label>
<div class="row"><button class="primary">Apply</button><button class="secondary" name="skip" value="1">Skip for now</button></div></form></dialog>
<script>document.getElementById('pin').showModal()</script>` : ''}</body></html>`;
}

function tile(p) {
  const pack = p.packs[0];
  return `<div class="tile">${p.sponsored ? '<span class="sponsored">Sponsored</span>' : ''}
<a class="img" href="/p/${p.id}"><img alt="${esc(p.name)}" width="1" height="1" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>
<a href="/p/${p.id}">${esc(p.name)}, ${esc(pack.size)}</a><span>${p.rating.toFixed(1)} out of 5 stars, ${p.reviews.toLocaleString('en-IN')} ratings</span>
<span><span class="price">${rupees(pack.price)}</span> <span class="mrp">M.R.P. ${rupees(mrp(pack.price))}</span></span>
<form method="post" action="/cart/add" class="row"><input type="hidden" name="sku" value="${skuOf(p, pack.size, p.flavours[0])}">
<button class="primary">Add to cart</button><button class="secondary" type="button" aria-label="Add ${esc(p.name)} to wishlist">♡</button></form></div>`;
}

function search(url) {
  const q = (url.searchParams.get('q') ?? '').trim(), words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const brands = url.searchParams.getAll('brand'), sort = url.searchParams.get('sort') ?? 'relevance', pageNo = Math.max(1, Number(url.searchParams.get('page')) || 1);
  let found = products.filter(p => !words.length || words.some(w => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(w.replace(/s$/, ''))));
  const score = p => words.filter(w => p.name.toLowerCase().includes(w.replace(/s$/, ''))).length;
  found = found.filter(p => !brands.length || brands.includes(p.brand));
  found.sort(sort === 'price' ? (a, b) => a.packs[0].price - b.packs[0].price : (a, b) => Number(!!b.sponsored) - Number(!!a.sponsored) || score(b) - score(a));
  const per = 16, shown = found.slice((pageNo - 1) * per, pageNo * per), pages = Math.max(1, Math.ceil(found.length / per));
  const allBrands = [...new Set(products.map(p => p.brand))];
  const check = (name, value, label = value) => `<label><input type="checkbox" name="${name}" value="${esc(value)}"${url.searchParams.getAll(name).includes(value) ? ' checked' : ''}> ${esc(label)}</label>`;
  const link = n => { const next = new URL(url); next.searchParams.set('page', String(n)); return next.pathname + next.search; };
  return page(q ? `Results for ${q}` : 'All products', `<div class="layout"><aside class="filters" aria-label="Filters"><form action="/search"><input type="hidden" name="q" value="${esc(q)}">
<fieldset><legend>Brand</legend>${allBrands.map(b => check('brand', b)).join('')}</fieldset>
<fieldset><legend>Price</legend>${['Under ₹500', '₹500 to ₹1,000', '₹1,000 to ₹2,000', '₹2,000 to ₹5,000', 'Over ₹5,000'].map(v => check('price', v)).join('')}</fieldset>
<fieldset><legend>Pack size</legend>${['15 sachets', '30 sachets', '60 sachets', '1 kg', '2 kg'].map(v => check('pack', v)).join('')}</fieldset>
<fieldset><legend>Flavour</legend>${['Unflavoured', 'Chocolate', 'Vanilla', 'Kesar Pista', 'Cookies and Cream'].map(v => check('flavour', v)).join('')}</fieldset>
<fieldset><legend>Customer rating</legend>${['4 stars and up', '3 stars and up'].map(v => check('rating', v)).join('')}</fieldset>
<fieldset><legend>Availability</legend>${check('stock', 'In stock only')}</fieldset><div class="row"><button class="primary">Apply filters</button><a href="/search?q=${encodeURIComponent(q)}">Clear all</a></div></form></aside>
<section aria-label="Results"><div class="row"><h1>${found.length} results${q ? ` for “${esc(q)}”` : ''}</h1>
<form action="/search" class="row"><input type="hidden" name="q" value="${esc(q)}"><label>Sort by <select name="sort" onchange="this.form.submit()">
${[['relevance', 'Relevance'], ['price', 'Price: low to high']].map(([v, l]) => `<option value="${v}"${sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></form></div>
<div class="grid">${shown.map(tile).join('') || '<p>No products match. Try another search.</p>'}</div>
<nav class="pager" aria-label="Pages">${Array.from({ length: pages }, (_, i) => i + 1 === pageNo ? `<span aria-current="page">${i + 1}</span>` : `<a href="${link(i + 1)}">${i + 1}</a>`).join('')}${pageNo < pages ? `<a href="${link(pageNo + 1)}">Next</a>` : ''}</nav></section></div>`, { query: q, path: url.pathname + url.search });
}

function productPage(p, url) {
  const pack = p.packs.find(k => slug(k.size) === url.searchParams.get('pack')) ?? p.packs[0];
  const flavour = p.flavours.find(f => slug(f) === url.searchParams.get('flavour')) ?? p.flavours[0] ?? null;
  const item = parseSku(skuOf(p, pack.size, flavour)), added = url.searchParams.get('added') === '1';
  const radios = (name, values, current) => values.map(v => `<label><input type="radio" name="${name}" value="${slug(v)}"${v === current ? ' checked' : ''} onchange="this.form.submit()">${esc(v)}</label>`).join('');
  return page(p.name, `<div class="card stack"><a href="/search?q=${encodeURIComponent(p.category)}">${esc(p.category)}</a><h1>${esc(p.name)}</h1>
<p>${p.rating.toFixed(1)} out of 5 stars, ${p.reviews.toLocaleString('en-IN')} ratings · Brand: ${esc(p.brand)}</p>
<p><span class="price">${rupees(pack.price)}</span> <span class="mrp">M.R.P. ${rupees(mrp(pack.price))}</span> <span class="muted">Inclusive of all taxes</span></p>
<form action="/p/${p.id}"><fieldset class="chips"><legend>Pack size</legend>${radios('pack', p.packs.map(k => k.size), pack.size)}</fieldset>
${p.flavours.length ? `<fieldset class="chips"><legend>Flavour</legend>${radios('flavour', p.flavours, flavour)}</fieldset>` : ''}</form>
<p>${item.soldOut ? '<strong class="error">Currently unavailable.</strong> This pack size is out of stock in this flavour.' : state.pincode ? `In stock. Delivery to ${esc(state.pincode)} in 3 days.` : 'In stock. Enter a pincode to see delivery dates.'}</p>
${added ? `<p role="status"><strong>Added to cart:</strong> ${esc(lineName(item))}. <a href="/cart">Go to cart</a></p>` : ''}
${item.soldOut ? '<button class="secondary" type="button">Notify me when available</button>' : `<form method="post" action="/cart/add" class="row"><input type="hidden" name="sku" value="${skuOf(p, pack.size, flavour)}"><input type="hidden" name="back" value="/p/${p.id}?pack=${slug(pack.size)}${flavour ? `&flavour=${slug(flavour)}` : ''}&added=1">
<label>Quantity <select name="qty">${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select></label><button class="primary">Add to cart</button><button class="primary" name="buy" value="1">Buy now</button></form>`}
<h2>About this item</h2><p>${esc(p.about)}</p></div>
<div class="card"><h2>Customers also bought</h2><div class="grid">${products.filter(o => o.category === p.category && o.id !== p.id).slice(0, 4).map(tile).join('')}</div></div>`, { path: url.pathname + url.search });
}

function cartPage(message) {
  const lines = cartLines(), t = totals();
  return page('Cart', `<div class="card stack"><h1>Shopping cart</h1>${message ? `<p role="status">${esc(message)}</p>` : ''}
${lines.length ? `<table><thead><tr><th>Item</th><th>Price</th><th>Quantity</th><th></th></tr></thead><tbody>${lines.map(line => `<tr><td><a href="/p/${line.item.product.id}">${esc(lineName(line.item))}</a></td><td>${rupees(line.item.pack.price)}</td>
<td><form method="post" action="/cart/update"><input type="hidden" name="sku" value="${line.sku}"><label>Quantity for ${esc(line.item.product.name)} <select name="qty" onchange="this.form.submit()">${Array.from({ length: 10 }, (_, i) => `<option${i + 1 === line.qty ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label></form></td>
<td><form method="post" action="/cart/update"><input type="hidden" name="sku" value="${line.sku}"><input type="hidden" name="qty" value="0"><button class="secondary">Remove</button></form></td></tr>`).join('')}</tbody></table>
<p>Subtotal (${cartCount()} ${cartCount() === 1 ? 'item' : 'items'}): <span class="price">${rupees(t.items)}</span></p><form method="post" action="/checkout"><button class="primary">Proceed to checkout</button></form>`
    : '<p>Your cart is empty.</p><a href="/">Continue shopping</a>'}</div>`, { path: '/cart' });
}

function loginPage(next, error, otp) {
  return page('Sign in', `<div class="card stack"><h1>Sign in</h1><p class="muted">Sign in to continue to checkout.</p>${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
${otp ? `<form method="post" action="/login/otp"><input type="hidden" name="next" value="${esc(next)}"><label class="field">Enter the 6-digit OTP sent to your phone<input name="otp" inputmode="numeric" autocomplete="one-time-code"></label><button class="primary">Verify</button></form>`
    : `<form method="post" action="/login"><input type="hidden" name="next" value="${esc(next)}"><label class="field">Email or mobile number<input name="user" autocomplete="username"></label>
<label class="field">Password<input type="password" name="password" autocomplete="current-password"></label><button class="primary">Sign in</button></form>
<form method="get" action="/login"><input type="hidden" name="next" value="${esc(next)}"><input type="hidden" name="otp" value="1"><button class="secondary">Get an OTP instead</button></form>`}</div>`, { noPrompt: true });
}

function addressPage(values = {}, errors = {}) {
  const field = (name, label, extra = '') => `<label class="field">${label}<input name="${name}" value="${esc(values[name] ?? '')}"${errors[name] ? ' aria-invalid="true"' : ''} ${extra}></label>${errors[name] ? `<p class="error">${esc(errors[name])}</p>` : ''}`;
  return page('Delivery address', `<div class="card stack"><h1>Choose a delivery address</h1>
${state.addresses.length ? `<form method="post" action="/checkout/address"><fieldset><legend>Saved addresses</legend>${state.addresses.map((a, i) => `<label style="display:block"><input type="radio" name="saved" value="${i}"${i === 0 ? ' checked' : ''}> ${esc(`${a.name}, ${a.line1}, ${a.line2}, ${a.city} ${a.pincode}`)}</label>`).join('')}</fieldset><button class="primary">Deliver to this address</button></form><h2>Or add a new address</h2>` : ''}
<form method="post" action="/checkout/address">${Object.keys(errors).length ? '<p class="error" role="alert">Please fix the highlighted fields.</p>' : ''}
${field('name', 'Full name', 'autocomplete="name"')}${field('phone', 'Mobile number', 'inputmode="numeric" autocomplete="tel"')}${field('pincode', 'Pincode', 'inputmode="numeric" autocomplete="postal-code"')}
${field('line1', 'Flat, house no., building', 'autocomplete="address-line1"')}${field('line2', 'Area, street, sector', 'autocomplete="address-line2"')}${field('landmark', 'Landmark (optional)')}
${field('city', 'Town or city', 'autocomplete="address-level2"')}<label class="field">State<select name="state"${errors.state ? ' aria-invalid="true"' : ''}><option value="">Choose a state</option>${states.map(s => `<option${values.state === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>${errors.state ? `<p class="error">${esc(errors.state)}</p>` : ''}
<button class="primary">Save address and continue</button></form></div>`, { noPrompt: true });
}

function deliveryPage() {
  return page('Delivery', `<div class="card stack"><h1>Choose a delivery option</h1><p>Delivering to ${esc(state.address.name)}, ${esc(state.address.city)} ${esc(state.address.pincode)}. <a href="/checkout/address">Change</a></p>
<form method="post" action="/checkout/delivery"><fieldset><legend>Delivery options</legend>${slots.map((s, i) => `<label style="display:block"><input type="radio" name="slot" value="${s.id}"${(state.slot ?? 'standard') === s.id || (!state.slot && i === 0) ? ' checked' : ''}> ${esc(s.label)}, arrives ${s.when}, ${s.fee ? rupees(s.fee) : 'free'}</label>`).join('')}</fieldset>
<button class="primary">Continue</button></form></div>`, { noPrompt: true });
}

function paymentPage(error) {
  const t = totals(), chosen = state.payment ?? 'upi';
  return page('Payment', `<div class="card stack"><h1>Select a payment method</h1><p>Order total: <span class="price">${rupees(t.total)}</span></p>${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/checkout/payment"><fieldset><legend>Payment method</legend>${payments.map(p => `<label style="display:block"><input type="radio" name="payment" value="${p.id}"${chosen === p.id ? ' checked' : ''} onchange="this.form.action='/checkout/payment?choose=1';this.form.submit()"${p.id === 'cod' && t.total > codLimit ? ' disabled' : ''}> ${esc(p.label)}${p.id === 'cod' && t.total > codLimit ? ' (not available above ' + rupees(codLimit) + ')' : ''}</label>`).join('')}</fieldset>
${chosen === 'card' ? `<label class="field">Card number<input name="card" inputmode="numeric" autocomplete="cc-number"></label><label class="field">Expiry (MM/YY)<input name="expiry" autocomplete="cc-exp"></label><label class="field">CVV<input type="password" name="cvv" inputmode="numeric" autocomplete="cc-csc"></label>` : ''}
${chosen === 'upi' ? '<label class="field">UPI ID (optional; you can also approve in your UPI app)<input name="vpa"></label>' : ''}
<button class="primary">Continue</button></form></div>`, { noPrompt: true });
}

function reviewPage() {
  const t = totals(), lines = cartLines();
  return page('Review your order', `<div class="card stack"><h1>Review your order</h1>
<table><tbody>${lines.map(line => `<tr><td>${esc(lineName(line.item))}</td><td>Quantity ${line.qty}</td><td>${rupees(line.item.pack.price * line.qty)}</td></tr>`).join('')}</tbody></table>
<p>Deliver to: ${esc(`${state.address.name}, ${state.address.line1}, ${state.address.line2}, ${state.address.city} ${state.address.pincode}`)}</p>
<p>Delivery: ${esc(slots.find(s => s.id === state.slot).label)} · Payment: ${esc(payments.find(p => p.id === state.payment).label)}</p>
<p>Items: ${rupees(t.items)} · Delivery: ${t.delivery ? rupees(t.delivery) : 'free'} · <strong>Order total: ${rupees(t.total)}</strong></p>
<form method="post" action="/checkout/place"><button class="primary">Place order</button></form></div>`, { noPrompt: true });
}

function orderPage(order) {
  if (order.status === 'pending') return page('Complete your payment', `<div class="card stack"><h1>Complete your payment</h1>
<p role="status">${order.payment === 'card' ? 'Enter the OTP sent to your phone on your bank’s page to finish paying.' : order.payment === 'netbanking' ? 'Finish paying on your bank’s website.' : 'Approve the payment request in your UPI app.'} This page updates by itself.</p>
<p>Amount: <span class="price">${rupees(order.total)}</span> · Order ${esc(order.id)} is not placed until the payment is approved.</p></div>`, { noPrompt: true, refresh: 2 });
  return page('Order placed', `<div class="card stack"><h1>Order placed, thank you!</h1><p>Order number <strong>${esc(order.id)}</strong></p>
<p>Arriving ${esc(order.when)} · Delivering to ${esc(order.address.name)}, ${esc(order.address.city)} ${esc(order.address.pincode)}</p>
<table><tbody>${order.lines.map(l => `<tr><td>${esc(l.name)}</td><td>Quantity ${l.qty}</td><td>${rupees(l.price * l.qty)}</td></tr>`).join('')}</tbody></table>
<p>Order total: <strong>${rupees(order.total)}</strong> · Paid by ${esc(payments.find(p => p.id === order.payment).label)}</p><a href="/orders">Your orders</a></div>`, { noPrompt: true });
}

const validate = v => {
  const errors = {};
  for (const [k, label] of [['name', 'full name'], ['line1', 'flat or house number'], ['line2', 'area or street'], ['city', 'town or city']]) if (!v[k]?.trim()) errors[k] = `Enter your ${label}.`;
  if (!/^[6-9]\d{9}$/.test(v.phone?.replace(/[\s-]/g, '') ?? '')) errors.phone = 'Enter a 10-digit mobile number.';
  if (!/^[1-9]\d{5}$/.test(v.pincode?.trim() ?? '')) errors.pincode = 'Enter a 6-digit pincode.';
  if (!states.includes(v.state)) errors.state = 'Choose a state.';
  return errors;
};
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) throw new Error('too large'); }
  return req.headers['content-type']?.includes('json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
}
const send = (res, status, html, type = 'text/html; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(html); };
const go = (res, location) => { res.writeHead(303, { location, 'cache-control': 'no-store' }); res.end(); };
const checkoutReady = () => cartLines().length > 0;
// Where checkout continues from: the first step still missing.
const checkoutStep = () => !state.signedIn && state.loginWall ? '/login?next=/checkout' : !state.address ? '/checkout/address' : !state.slot ? '/checkout/delivery' : !state.payment ? '/checkout/payment' : '/checkout/review';

async function handle(req, res) {
  const url = new URL(req.url, 'http://shop.test'), path = url.pathname, post = req.method === 'POST';
  if (!path.startsWith('/__/')) state.visits.push(`${req.method} ${path}${url.search}`);
  // Test hooks: never linked from any page.
  if (path === '/__/state') return send(res, 200, JSON.stringify({ ...state, cart: cartLines().map(l => ({ sku: l.sku, name: lineName(l.item), qty: l.qty, price: l.item.pack.price })), totals: totals() }, null, 2), 'application/json');
  if (path === '/__/reset' && post) { state = fresh(await body(req)); return send(res, 200, '{"ok":true}', 'application/json'); }
  if (path.startsWith('/__/pay/') && post) {
    const order = state.orders.find(o => o.id === path.slice(8) && o.status === 'pending');
    if (!order) return send(res, 404, '{"ok":false}', 'application/json');
    order.status = 'placed'; state.cart = []; return send(res, 200, '{"ok":true}', 'application/json');
  }
  if (path === '/' && !post) return send(res, 200, page('Home', `<div class="card"><h1>Deals of the day</h1><p>Up to 40% off on protein, dairy and everyday essentials.</p></div>
<div class="card"><h2>Bestsellers</h2><div class="grid">${products.slice(0, 8).map(tile).join('')}</div></div>`, { path: '/' }));
  if (path === '/search') return send(res, 200, search(url));
  if (path.startsWith('/p/')) { const p = product(path.slice(3)); return p ? send(res, 200, productPage(p, url)) : send(res, 404, page('Not found', '<h1>That product isn’t available.</h1>')); }
  if (path.startsWith('/info/')) return send(res, 200, page('Information', `<div class="card"><h1>${esc(path.slice(6).replace(/-/g, ' '))}</h1><p>Nothing to see here; this is a test store.</p></div>`));
  if (path === '/pincode') {
    if (!post) return send(res, 200, page('Delivery location', `<div class="card"><form method="post" action="/pincode"><label class="field">Pincode<input name="pincode" inputmode="numeric" value="${esc(state.pincode ?? '')}"></label><button class="primary">Apply</button></form></div>`, { noPrompt: true }));
    const form = await body(req), back = form.back?.startsWith('/') ? form.back : '/';
    if (form.skip) { state.pincodePrompt = false; return go(res, back); }
    if (!/^[1-9]\d{5}$/.test(form.pincode?.trim() ?? '')) return send(res, 200, page('Delivery location', `<div class="card"><p class="error" role="alert">Enter a valid 6-digit pincode.</p><form method="post" action="/pincode"><input type="hidden" name="back" value="${esc(back)}"><label class="field">Pincode<input name="pincode" inputmode="numeric" value="${esc(form.pincode ?? '')}"></label><button class="primary">Apply</button></form></div>`, { noPrompt: true }));
    state.pincode = form.pincode.trim(); return go(res, back);
  }
  if (path === '/cart/add' && post) {
    const form = await body(req), item = parseSku(form.sku), qty = Math.min(10, Math.max(1, Number(form.qty) || 1));
    if (!item || item.soldOut) return send(res, 400, cartPage('That item can’t be added.'));
    const line = state.cart.find(l => l.sku === form.sku);
    if (line) line.qty = Math.min(10, line.qty + qty); else state.cart.push({ sku: form.sku, qty });
    return go(res, form.buy ? '/checkout' : form.back?.startsWith('/') ? form.back : '/cart?added=1');
  }
  if (path === '/cart/update' && post) {
    const form = await body(req), qty = Math.min(10, Math.max(0, Number(form.qty) || 0));
    state.cart = state.cart.flatMap(l => l.sku !== form.sku ? [l] : qty ? [{ ...l, qty }] : []);
    return go(res, '/cart');
  }
  if (path === '/cart') return send(res, 200, cartPage(url.searchParams.get('added') ? 'Added to your cart.' : ''));
  if (path === '/login' && !post) return send(res, 200, loginPage(url.searchParams.get('next') ?? '/', '', url.searchParams.get('otp') === '1'));
  if ((path === '/login' || path === '/login/otp') && post) {
    const form = await body(req), next = form.next?.startsWith('/') ? form.next : '/';
    const ok = path === '/login/otp' ? /^\d{6}$/.test(form.otp ?? '') : !!form.user?.trim() && !!form.password;
    if (!ok) return send(res, 200, loginPage(next, path === '/login/otp' ? 'That OTP is not valid.' : 'Enter your email or mobile number and password.', path === '/login/otp'));
    state.signedIn = true; return go(res, next);
  }
  if (path === '/orders') return send(res, 200, page('Your orders', `<div class="card"><h1>Your orders</h1>${state.orders.filter(o => o.status === 'placed').map(o => `<p><a href="/order/${o.id}">${esc(o.id)}</a> · ${esc(o.lines.map(l => l.name).join('; '))} · ${rupees(o.total)}</p>`).join('') || '<p>No orders yet.</p>'}</div>`));
  if (path.startsWith('/order/')) { const o = state.orders.find(x => x.id === path.slice(7)); return o ? send(res, 200, orderPage(o)) : send(res, 404, page('Not found', '<h1>No such order.</h1>')); }
  if (path.startsWith('/checkout')) {
    if (!checkoutReady()) return go(res, '/cart');
    if (!state.signedIn && state.loginWall) return go(res, '/login?next=/checkout');
    if (path === '/checkout') return go(res, checkoutStep());
    if (path === '/checkout/address') {
      if (!post) return send(res, 200, addressPage());
      const form = await body(req);
      if (form.saved !== undefined && state.addresses[Number(form.saved)]) { state.address = state.addresses[Number(form.saved)]; return go(res, '/checkout/delivery'); }
      const errors = validate(form);
      if (Object.keys(errors).length) return send(res, 200, addressPage(form, errors));
      state.address = { name: form.name.trim(), phone: form.phone.replace(/[\s-]/g, ''), pincode: form.pincode.trim(), line1: form.line1.trim(), line2: form.line2.trim(), landmark: form.landmark?.trim() ?? '', city: form.city.trim(), state: form.state };
      state.addresses.push(state.address); return go(res, '/checkout/delivery');
    }
    if (!state.address) return go(res, '/checkout/address');
    if (path === '/checkout/delivery') {
      if (!post) return send(res, 200, deliveryPage());
      const form = await body(req); if (!slots.some(s => s.id === form.slot)) return send(res, 200, deliveryPage());
      state.slot = form.slot; return go(res, '/checkout/payment');
    }
    if (!state.slot) return go(res, '/checkout/delivery');
    if (path === '/checkout/payment') {
      if (!post) return send(res, 200, paymentPage());
      const form = await body(req), method = payments.find(p => p.id === form.payment);
      if (!method || (method.id === 'cod' && totals().total > codLimit)) return send(res, 200, paymentPage('Choose a payment method.'));
      state.payment = method.id;
      if (url.searchParams.get('choose')) return go(res, '/checkout/payment');
      // Card details are taken but never stored: the bank's OTP step comes after Place order.
      if (method.id === 'card' && !(/^\d{13,19}$/.test((form.card ?? '').replace(/\s/g, '')) && /^\d{3,4}$/.test(form.cvv ?? ''))) return send(res, 200, paymentPage('Enter your card number and CVV.'));
      return go(res, '/checkout/review');
    }
    if (!state.payment) return go(res, '/checkout/payment');
    if (path === '/checkout/review') return send(res, 200, reviewPage());
    if (path === '/checkout/place' && post) {
      const t = totals(), slot = slots.find(s => s.id === state.slot);
      const order = { id: `KTM-${String(482900 + state.next++)}`, status: state.payment === 'cod' ? 'placed' : 'pending', payment: state.payment, address: state.address, when: slot.when,
        lines: cartLines().map(l => ({ sku: l.sku, name: lineName(l.item), qty: l.qty, price: l.item.pack.price })), total: t.total };
      state.orders.push(order); if (order.status === 'placed') state.cart = [];
      state.slot = null; state.payment = null; return go(res, `/order/${order.id}`);
    }
  }
  return send(res, 404, page('Not found', '<div class="card"><h1>Page not found</h1><a href="/">Go to the home page</a></div>'));
}

/** Start the shop on 127.0.0.1. Resolves to { url, port, state(), reset(options), close() }. */
function startShop(port = 0) {
  const server = http.createServer((req, res) => { handle(req, res).catch(error => send(res, 500, `Error: ${esc(error.message)}`, 'text/plain')); });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port, url = `http://127.0.0.1:${actual}`;
      resolve({ url, port: actual, state: () => JSON.parse(JSON.stringify(state)), reset: options => { state = fresh(options); },
        close: () => new Promise(done => { server.closeAllConnections?.(); server.close(() => done()); }) });
    });
  });
}
module.exports = { startShop, products };
if (require.main === module) startShop(Number(process.argv[2]) || 4410).then(shop => console.log(`Kite Test Mart: ${shop.url}`));
