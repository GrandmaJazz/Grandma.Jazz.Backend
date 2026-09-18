const { test } = require('node:test');
const assert = require('node:assert/strict');
const { quoteShipment, postageThb, assertAcceptedQuote, normalizeCart } = require('../src/services/shippingService');
const Product = require('../src/models/Product');

const id = '6960d35706185775d0cd4692';
const now = new Date('2026-09-18T12:00:00Z');
const countries = ['United Kingdom', 'United States of America', 'Australia', 'Singapore'];
const config = {
  version: 'test-measured-pack', thbPerUsd: 33, domesticPostageThb: 50,
  enabledCountries: countries, ratesVerifiedUntil: '2026-09-25T12:00:00Z',
  packingProfiles: [{ id: 'measured-box', maxNetGrams: 1000, maxUnits: 3, outerPackagingGrams: 40, productIds: [id] }]
};
const product = { _id: id, name: 'Small grinder', price: 6.01, weight: 0.2, images: ['https://example.com/grinder.jpg'],
  shippingPackagingGrams: 10, internationalShippingCountries: countries };
const cart = [{ product: id, quantity: 1 }];
const quote = (items = cart, products = [product], country = 'United Kingdom', settings = config) => quoteShipment(items, products, country, settings, now);

test('catalogue rounds legacy and new prices per unit, without changing historical order amounts', () => {
  const existing = Product.hydrate({ ...product, price: 6.01 });
  assert.equal(existing.price, 7);
  assert.equal(existing.toJSON().price, 7);
  const newProduct = new Product({ ...product, price: 39.06 });
  assert.equal(newProduct.price, 40);
  assert.equal(new Product({ ...product, price: 25 }).price, 25);
});

test('official merchandise zones: UK/Germany 3, US 17, Singapore 1', () => {
  assert.equal(postageThb('United Kingdom', 500), 1280);
  assert.equal(postageThb('Germany', 500), 1280);
  assert.equal(postageThb('United States of America', 500), 1980);
  assert.equal(postageThb('Singapore', 500), 820);
});

test('paper protection and one outer carton move the parcel into the correct bracket', () => {
  const first = quote();
  assert.equal(first.grossGrams, 250);
  assert.equal(first.postageThb, 1190);
  assert.equal(first.subtotal, 7);
  assert.equal(first.shippingCost, 36.07);
  const second = quote(cart, [{ ...product, shippingPackagingGrams: 11 }]);
  assert.equal(second.grossGrams, 251);
  assert.equal(second.postageThb, 1280);
  assert.equal(second.shippingCost, 38.79);
});

test('multiple units round unit prices first; shipping is charged once', () => {
  const result = quote([{ product: id, quantity: 2, price: 0, weight: 0 }]);
  assert.equal(result.subtotal, 14);
  assert.equal(result.grossGrams, 460);
  assert.equal(result.shippingCost, 38.79);
  assert.equal(result.orderItems[0].price, 7);
});

test('Thailand retains the separate 50 THB flat charge with no $50 initial value', () => {
  const result = quote(cart, [{ ...product, shippingPackagingGrams: null, internationalShippingCountries: [] }], 'Thailand');
  assert.equal(result.shippingCost, 1.52);
  assert.equal(result.subtotal, 7);
});

test('country-specific caps and tariff transcription corrections match the published grid', () => {
  assert.equal(postageThb('Australia', 20000), 12780);
  assert.throws(() => postageThb('Australia', 20001));
  assert.throws(() => postageThb('Poland', 20001));
  assert.equal(postageThb('Brazil', 30000), 23160);
  assert.equal(postageThb('United Kingdom', 15500), 6400);
  assert.equal(postageThb('Austria', 15500), 8660);
  assert.equal(postageThb('Bangladesh', 21000), 6630);
  assert.equal(postageThb('South Africa', 28500), 16160);
  assert.equal(postageThb('United States of America', 27500), 19430);
});

test('unverified, expired, unknown or unmeasured shipments never become free shipping', () => {
  assert.throws(() => quote(cart, [product], 'United Kingdom', { ...config, enabledCountries: [] }));
  assert.throws(() => quote(cart, [product], 'United Kingdom', { ...config, ratesVerifiedUntil: '2026-09-17' }));
  assert.throws(() => quote(cart, [product], 'United Kingdom', { ...config, ratesVerifiedUntil: '2026-09-18T12:30:00Z' }));
  assert.throws(() => quote(cart, [product], 'Unknown'));
  assert.throws(() => quote(cart, [{ ...product, shippingPackagingGrams: null }]));
  assert.throws(() => quote(cart, [product], 'United Kingdom', { ...config, packingProfiles: [] }));
  assert.throws(() => quote(cart, [product], 'United Kingdom', { ...config, thbPerUsd: 0 }));
  assert.throws(() => quote(cart, [{ ...product, weight: NaN }]));
});

test('unapproved goods, dangerous goods, stock loss and untested combinations block payment', () => {
  assert.throws(() => quote(cart, [{ ...product, internationalShippingCountries: [] }]));
  for (const name of ['Matches', 'Zippo', 'Pocket lighter']) assert.throws(() => quote(cart, [{ ...product, name }]));
  assert.throws(() => quote(cart, [{ ...product, isOutOfStock: true }]));
  assert.throws(() => quote([{ product: id, quantity: 4 }]));
  assert.throws(() => quote(cart, [product], 'United Kingdom', { ...config, packingProfiles: [{ ...config.packingProfiles[0], productIds: [] }] }));
});

test('malformed quantities/IDs rejected and duplicates combined before calculating mass', () => {
  for (const quantity of [0, -1, 1.5, 100, '1', NaN]) assert.throws(() => quote([{ product: id, quantity }]));
  assert.throws(() => quote([{ product: 'bad', quantity: 1 }]));
  assert.deepEqual(normalizeCart([...cart, ...cart]), [{ product: id, quantity: 2 }]);
  assert.equal(quote([...cart, ...cart]).grossGrams, 460);
});

test('checkout rejects tampered postage and stale price/packing quotes before Stripe', () => {
  const accepted = quote();
  assert.doesNotThrow(() => assertAcceptedQuote(accepted, accepted));
  assert.throws(() => assertAcceptedQuote(accepted, { ...accepted, shippingCost: 0 }));
  assert.throws(() => assertAcceptedQuote(accepted, { ...accepted, subtotal: 0 }));
  assert.throws(() => assertAcceptedQuote(quote(cart, [{ ...product, price: 7.1 }]), accepted));
  assert.throws(() => assertAcceptedQuote(quote(cart, [product], 'United Kingdom', { ...config, version: 'new-pack' }), accepted));
});
