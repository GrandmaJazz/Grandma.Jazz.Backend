const { createHash } = require('node:crypto');
const defaultConfig = require('../config/shipping-rates.json');

class CheckoutError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new CheckoutError(message, status); };

function validateConfig(config) {
  if (!config.version || !Number.isFinite(config.thbPerUsd) || config.thbPerUsd <= 0 ||
      !Number.isSafeInteger(config.packagingGrams) || config.packagingGrams < 0 ||
      !Number.isSafeInteger(config.maxWeightGrams) || config.maxWeightGrams <= 0 ||
      !Number.isSafeInteger(config.domesticFlatThb) || config.domesticFlatThb <= 0 ||
      !Number.isFinite(Date.parse(config.reviewDueAt))) fail('Shipping configuration is invalid', 503);
  let previous = 0;
  for (const row of config.rates) {
    if (!Number.isSafeInteger(row.upToGrams) || row.upToGrams <= previous || row.thb.length !== 19 ||
        row.thb.some(rate => !Number.isSafeInteger(rate) || rate < 0)) fail('Shipping rate table is invalid', 503);
    previous = row.upToGrams;
  }
  if (previous !== config.maxWeightGrams || Object.values(config.countryZones).some(zone =>
    !Number.isInteger(zone) || zone < 0 || zone > 19)) fail('Shipping zones are invalid', 503);
}
validateConfig(defaultConfig);

function calculateShipping(country, productWeightGrams, config = defaultConfig, now = new Date()) {
  validateConfig(config);
  if (now >= new Date(`${config.reviewDueAt}T00:00:00Z`)) fail('Shipping rates need review. Please contact the shop.', 503);
  if (typeof country !== 'string' || !Object.hasOwn(config.countryZones, country)) fail('Shipping is unavailable for this destination.');
  if (!Number.isSafeInteger(productWeightGrams) || productWeightGrams <= 0) fail('Cart weight is invalid.');
  const packedWeightGrams = productWeightGrams + config.packagingGrams;
  if (packedWeightGrams > config.maxWeightGrams) fail('Packed order exceeds the 30 kg shipping limit.');
  if (packedWeightGrams > (config.countryMaxWeightGrams?.[country] || config.maxWeightGrams))
    fail('Shipping is unavailable above the destination weight limit.');
  const zone = config.countryZones[country];
  const bracket = config.rates.find(row => packedWeightGrams <= row.upToGrams);
  const rateThb = country === 'Thailand' ? config.domesticFlatThb : bracket?.thb[zone - 1];
  if (!rateThb) fail('Shipping is unavailable for this destination and packed weight.');
  return {
    service: country === 'Thailand' ? 'Domestic shipping' : config.service,
    rateVersion: config.version, thbPerUsd: config.thbPerUsd,
    productWeightGrams, packagingGrams: config.packagingGrams, packedWeightGrams,
    bracketGrams: country === 'Thailand' ? config.maxWeightGrams : bracket.upToGrams,
    rateThb, shippingCents: Math.round(rateThb * 100 / config.thbPerUsd),
  };
}

// Only IDs and quantities are accepted as cart input. Everything chargeable is reloaded.
async function buildQuote(input, userId, { findProducts, findDiscount, config = defaultConfig, now } = {}) {
  if (!input || !Array.isArray(input.orderItems) || !input.orderItems.length || input.orderItems.length > 100)
    fail('Choose between 1 and 100 product lines.');
  const quantities = new Map();
  for (const item of input.orderItems) {
    if (!item || typeof item.product !== 'string' || !/^[a-f\d]{24}$/i.test(item.product) ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
      fail('Each product needs a valid ID and a whole quantity from 1 to 99.');
    const id = item.product.toLowerCase();
    const quantity = (quantities.get(id) || 0) + item.quantity;
    if (quantity > 99) fail('Maximum quantity is 99 per product.');
    quantities.set(id, quantity);
  }
  const products = await findProducts([...quantities.keys()]);
  const orderItems = [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, quantity]) => {
    const product = products.find(p => String(p._id) === id);
    if (!product) fail('A product in your cart no longer exists.', 404);
    if (product.isOutOfStock) fail(`${product.name} is out of stock.`);
    if (!Number.isFinite(product.price) || product.price < 0 || product.price > 100000 ||
        !Number.isFinite(product.weight) || product.weight <= 0 || product.weight > 30)
      fail(`${product.name} needs a valid store price and weight.`, 503);
    return { product: id, name: product.name, quantity, price: Math.round(product.price * 100) / 100,
      weight: product.weight, image: product.images[0] };
  });
  const productWeightGrams = orderItems.reduce((sum, item) => sum + Math.ceil(item.weight * 1000) * item.quantity, 0);
  const shipping = calculateShipping(input.destinationCountry, productWeightGrams, config, now);
  const subtotalCents = orderItems.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  let discountCents = 0;
  let discountCode = null;
  if (input.discountCode != null && input.discountCode !== '') {
    if (typeof input.discountCode !== 'string' || input.discountCode.length > 100) fail('Invalid discount code.');
    const discount = await findDiscount(input.discountCode.trim().toUpperCase());
    if (!discount) fail('Discount code not found.');
    const validity = discount.isValid();
    if (!validity.valid) fail(validity.message);
    if (discount.hasUserUsed(userId)) fail('You have already used this discount code.');
    if (!Number.isFinite(discount.value) || discount.value < 0 ||
        !['percentage', 'fixed'].includes(discount.discountType)) fail('Invalid discount configuration.', 503);
    discountCents = Math.min(subtotalCents, Math.round(discount.discountType === 'percentage'
      ? subtotalCents * discount.value / 100 : discount.value * 100));
    discountCode = discount.code;
  }
  const quote = { currency: 'USD', destinationCountry: input.destinationCountry, orderItems,
    subtotalCents, discountCents, discountCode, shipping,
    totalCents: subtotalCents - discountCents + shipping.shippingCents };
  const quoteId = createHash('sha256').update(JSON.stringify({ userId: String(userId), ...quote })).digest('hex');
  return { ...quote, quoteId };
}

function assertQuoteAccepted(quote, quoteId) {
  if (typeof quoteId !== 'string' || quote.quoteId !== quoteId)
    fail('Your checkout total changed. Refresh the quote and review it before payment.', 409);
}
module.exports = { buildQuote, calculateShipping, validateConfig, assertQuoteAccepted, CheckoutError, defaultConfig };
