const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
// Disposable process-only fixtures. Never load app.js/server.js (which start
// background workers), connect Mongoose, or call an external Stripe/mail API.
process.env.STRIPE_SECRET_KEY = 'sk_test_local_fixture_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_fixture_only';
process.env.CLIENT_URL = 'https://example.com';
delete process.env.ORDER_EMAIL_ENABLED;
const Stripe = require('stripe');
const signing = Stripe(process.env.STRIPE_SECRET_KEY).webhooks;
let paymentSession;
let paymentConfig;
let order;
let notifications = 0;
let updates = 0;
const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const user = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const fakeStripe = {
  webhooks: signing,
  checkout: { sessions: {
    create: async config => {
      paymentConfig = config;
      paymentSession = { id: 'cs_test_local_fixture', url: 'https://example.com/pay',
        mode: config.mode, status: 'open', currency: 'usd', payment_status: 'unpaid',
        amount_total: config.line_items.reduce((total, item) => total + item.price_data.unit_amount * item.quantity, 0)
          + config.shipping_options[0].shipping_rate_data.fixed_amount.amount,
        metadata: config.metadata, payment_intent: 'pi_local_fixture' };
      return paymentSession;
    },
    retrieve: async sessionId => {
      assert.equal(sessionId, 'cs_test_local_fixture');
      return structuredClone(paymentSession);
    },
  } },
};
require.cache[require.resolve('stripe')].exports = () => fakeStripe;
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const Discount = require('../src/models/Discount');
Product.find = async () => [{ _id: id, name: 'Hand fan fixture', price: 5, weight: 0.06,
  images: ['https://example.com/fan.jpg'] }];
User.findById = async () => ({ profileComplete: true, phone: '+440000000000' });
Discount.findOne = async () => null;
Order.create = async values => { order = { _id: id, isPaid: false, ...values }; return structuredClone(order); };
Order.findById = async target => String(target) === id && order ? structuredClone(order) : null;
const matches = filter => (!filter.status || filter.status === order.status) &&
  (!filter.isPaid || !order.isPaid) &&
  (!filter.checkoutSessionLockToken || filter.checkoutSessionLockToken === order.checkoutSessionLockToken) &&
  (!filter.$or || !order.checkoutSessionLockUntil || +order.checkoutSessionLockUntil <= Date.now());
const apply = update => {
  order = { ...order, ...update.$set };
  for (const key of Object.keys(update.$unset || {})) delete order[key];
  if (update.$set?.isPaid) updates++;
};
Order.findOneAndUpdate = async (filter, update) => {
  if (!matches(filter)) return null;
  apply(update); return structuredClone(order);
};
Order.updateOne = async (filter, update) => {
  if (!matches(filter)) return { matchedCount: 0 };
  apply(update); return { matchedCount: 1 };
};
const emailPath = require.resolve('../src/services/emailService');
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: {
  sendOrderNotificationToAdmins: async () => { notifications++; },
  sendOrderConfirmationToCustomer: async () => { notifications++; },
} };
const authPath = require.resolve('../src/middleware/authMiddleware');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  protect: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false });
    req.user = { _id: req.headers.authorization === 'Bearer owner' ? user : 'cccccccccccccccccccccccc' }; next();
  },
  admin: (req, res, next) => next(), completeProfile: (req, res, next) => next(),
} };
const shippingConfig = require('../src/config/shipping-rates.json');
shippingConfig.reviewDueAt = '2099-01-01';
shippingConfig.internationalProductIds = [id];
const service = require('../src/services/stripeService');
const app = express();
app.use('/api/webhook', require('../src/routes/webhookRoutes'));
app.use(express.json()); app.use('/api/orders', require('../src/routes/orderRoutes'));
app.use('/api/tickets', require('../src/routes/ticketRoutes'));
app.use(require('../src/middleware/errorMiddleware').errorHandler);
const server = app.listen(0, '127.0.0.1');
after(() => server.close());
async function request(path, { body, authorization = 'Bearer owner' } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/orders${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(authorization ? { authorization } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
async function start() {
  const cart = { orderItems: [{ product: id, quantity: 2, price: 0 }], destinationCountry: 'United Kingdom', shippingCost: 0 };
  const quoted = await request('/quote', { body: cart });
  assert.equal(quoted.status, 200);
  const created = await request('', { body: { ...cart, quoteId: quoted.body.quote.quoteId, shippingAddress: 'Local fixture only' } });
  assert.equal(created.status, 201);
  return quoted.body.quote;
}
test('real quote/create/Stripe-config contract keeps server totals and unpaid verification honest', async () => {
  const quote = await start();
  assert.equal(paymentSession.amount_total, quote.totalCents);
  assert.equal(order.totalAmount * 100, quote.totalCents);
  assert.equal(paymentConfig.cancel_url, `https://example.com/orders/${id}`);
  assert.equal(paymentConfig.metadata.quoteId, quote.quoteId);
  const unpaid = await request('/verify-payment/cs_test_local_fixture');
  assert.deepEqual(unpaid.body, { success: true, isPaid: false });
  assert.equal(updates, 0);
});
test('verification route enforces ownership and auth, including unpaid sessions', async () => {
  await start();
  assert.equal((await request('/verify-payment/cs_test_local_fixture', { authorization: '' })).status, 401);
  assert.equal((await request('/verify-payment/cs_test_local_fixture', { authorization: 'Bearer other' })).status, 403);
  assert.equal((await request('/verify-payment/not-a-session')).status, 400);
  assert.equal(updates, 0);
});
test('signed webhook and returning browser racing/repeating produce one paid state and no deferred mail', async () => {
  await start(); paymentSession = { ...paymentSession, status: 'complete', payment_status: 'paid' };
  const payload = JSON.stringify({ id: 'evt_local_fixture', type: 'checkout.session.completed', data: { object: paymentSession } });
  const signature = signing.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  await Promise.all([
    service.handleWebhook(Buffer.from(payload), signature),
    service.verifyPayment('cs_test_local_fixture', user),
    service.handleWebhook(Buffer.from(payload), signature),
  ]);
  assert.equal(order.isPaid, true); assert.equal(updates, 1); assert.equal(notifications, 0);
  const response = await request('/verify-payment/cs_test_local_fixture');
  assert.equal(response.status, 200); assert.equal(response.body.isPaid, true);
  assert.equal(response.body.order._id, id); assert.equal(updates, 1);
  assert.equal((await request('/verify-payment/cs_test_local_fixture', { authorization: 'Bearer other' })).status, 403);
});
test('invalid/tampered Stripe signatures cannot mutate an order', async () => {
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: paymentSession } });
  const signature = signing.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const oldError = console.error; console.error = () => {};
  try {
    await assert.rejects(service.handleWebhook(Buffer.from(`${payload} `), signature));
    await assert.rejects(service.handleWebhook(Buffer.from(payload), 'invalid-signature'));
  } finally { console.error = oldError; }
  assert.equal(updates, 1); assert.equal(notifications, 0);
});

test('actual webhook route preserves raw bytes and rejects invalid HTTP signatures', async () => {
  await start(); paymentSession = { ...paymentSession, status: 'complete', payment_status: 'paid' };
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: paymentSession } });
  const signature = signing.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const send = async (body, header) => fetch(`http://127.0.0.1:${server.address().port}/api/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body,
  });
  const oldError = console.error; console.error = () => {};
  try {
    assert.equal((await send(`${payload} `, signature)).status, 400);
    assert.equal(order.isPaid, false);
    const paid = await send(payload, signature);
    assert.equal(paid.status, 200); assert.deepEqual(await paid.json(), { received: true });
    assert.equal(order.isPaid, true); assert.equal(updates, 2); assert.equal(notifications, 0);
  } finally { console.error = oldError; }
});

test('legacy ticket verification is owner-only and duplicate signed callbacks update it once', async () => {
  const Ticket = require('../src/models/Ticket');
  let ticket = { _id: id, user, totalAmount: 25, status: 'pending', ticketNumber: 'TKT-FIXTURE' };
  let ticketUpdates = 0;
  Ticket.findById = async () => structuredClone(ticket);
  Ticket.findOneAndUpdate = async (filter, update) => {
    if (filter.status !== ticket.status) return null;
    ticket = { ...ticket, ...update.$set }; ticketUpdates++; return structuredClone(ticket);
  };
  paymentSession = { ...paymentSession, amount_total: 2500, status: 'complete', payment_status: 'paid',
    metadata: { type: 'ticket', ticketId: id } };
  const send = authorization => fetch(`http://127.0.0.1:${server.address().port}/api/tickets/verify-payment/cs_test_local_fixture`, {
    headers: authorization ? { authorization } : {},
  });
  const oldError = console.error; console.error = () => {};
  try {
    assert.equal((await send()).status, 401);
    assert.equal((await send('Bearer other')).status, 403); assert.equal(ticketUpdates, 0);
    paymentSession.amount_total = 1;
    assert.equal((await send('Bearer owner')).status, 409); assert.equal(ticketUpdates, 0);
    paymentSession.amount_total = 2500;
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: paymentSession } });
    const signature = signing.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const [response] = await Promise.all([send('Bearer owner'), service.handleWebhook(Buffer.from(payload), signature)]);
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.paid, true); assert.equal(body.ticket.ticketNumber, 'TKT-FIXTURE');
    assert.equal((await send('Bearer owner')).status, 200);
    assert.equal(ticketUpdates, 1); assert.equal(ticket.expiresAt, null); assert.equal(notifications, 0);
  } finally { console.error = oldError; }
});
