const { test } = require('node:test');
const assert = require('node:assert/strict');
const { quoteShipment } = require('../src/services/shippingService');
const config = require('../src/config/shipping.json');

const product = { _id: '6960d35706185775d0cd4692', name: 'Small grinder', price: 6.01, weight: 0.2,
  images: ['https://example.com/grinder.jpg'] };
let charged;
// Exercise the real order controller and quote loader without contacting
// MongoDB, Stripe or sending email. The only database record is this fixture.
function replaceModule(path, exports) {
  require.cache[require.resolve(path)] = { id: require.resolve(path), filename: require.resolve(path), loaded: true, exports };
}
replaceModule('../src/models/Product', { find: () => ({ lean: async () => [product] }) });
replaceModule('../src/models/User', { findById: async () => ({ profileComplete: true, phone: '+66123456789' }) });
replaceModule('../src/services/stripeService', {
  createCheckoutSession: async (...args) => {
    charged = args;
    return { session: { id: 'test-session', url: 'https://example.com/checkout' }, order: { _id: 'test-order', status: 'pending', totalAmount: 15.52 } };
  }
});
const { createOrder } = require('../src/controllers/orderController');
const cart = [{ product: product._id, quantity: 2 }];
const accepted = quoteShipment(cart, [product], 'Thailand', config);

async function checkout(body) {
  charged = undefined;
  const req = { user: { _id: '6960d35706185775d0cd4699' }, body: {
    orderItems: cart, shippingAddress: 'Kamala, Phuket 83150', destinationCountry: 'Thailand',
    quoteId: accepted.quoteId, subtotal: accepted.subtotal, shippingCost: accepted.shippingCost, ...body
  } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  let error;
  await createOrder(req, res, caught => { error = caught; });
  return { res, error };
}

test('payment uses current database product values despite forged browser prices and weights', async () => {
  const { res, error } = await checkout({ orderItems: [{ ...cart[0], price: 0.01, weight: 0, name: 'Forged', image: 'fake' }] });
  assert.equal(error, undefined);
  assert.equal(res.statusCode, 201);
  assert.equal(charged[0][0].price, 7);
  assert.equal(charged[0][0].quantity, 2);
  assert.equal(charged[0][0].name, 'Small grinder');
  assert.equal(charged[0][0].weight, 0.2);
  assert.equal(charged[5], 1.52);
  assert.equal(charged[8].quoteId, accepted.quoteId);
});

test('altered postage or missing reviewed quote never reaches payment', async () => {
  for (const body of [{ shippingCost: 0 }, { subtotal: 0.02 }, { quoteId: undefined }]) {
    const { res, error } = await checkout(body);
    assert.equal(res.statusCode, 409);
    assert.ok(error);
    assert.equal(charged, undefined);
  }
});

test('a price change after review returns a conflict without charging', async () => {
  product.price = 8;
  const { res, error } = await checkout({});
  assert.equal(res.statusCode, 409);
  assert.ok(error);
  assert.equal(charged, undefined);
});
