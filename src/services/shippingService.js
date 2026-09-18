const crypto = require('node:crypto');
const fs = require('node:fs');
const tariff = require('../config/emsWorldMerchandise.json');
const { roundProductPrice } = require('../utils/productPrice');

class ShippingError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

const countries = ['Thailand', ...Object.keys(tariff.countries).sort()];
const unavailable = 'Please contact us for a shipping quote to this destination before payment.';

function readShippingConfig() {
  // A deployment may supply its own measured packing profiles without editing code.
  const file = process.env.SHIPPING_CONFIG_PATH || require.resolve('../config/shipping.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeCart(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new ShippingError('Please add products to your cart.', 400);
  }
  const quantities = new Map();
  for (const item of items) {
    const id = String(item.product || item.productId || '');
    if (!/^[a-f\d]{24}$/i.test(id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new ShippingError('Invalid cart. Please check your quantities.', 400);
    }
    const key = id.toLowerCase();
    const quantity = (quantities.get(key) || 0) + item.quantity;
    if (quantity > 99) throw new ShippingError('Please contact us for bulk shipping.', 422);
    quantities.set(key, quantity);
  }
  return [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([product, quantity]) => ({ product, quantity }));
}

function postageThb(country, grossGrams) {
  const lane = tariff.countries[country];
  if (!lane || !Number.isSafeInteger(grossGrams) || grossGrams <= 0 || grossGrams > lane.maxGrams) {
    throw new ShippingError(unavailable);
  }
  const rows = lane.zone <= 10 ? tariff.rowsZone1To10 : tariff.rowsZone11To19;
  const row = rows.find(([from, to]) => grossGrams >= from && grossGrams <= to);
  const amount = row?.[2][lane.zone <= 10 ? lane.zone - 1 : lane.zone - 11];
  if (!amount) throw new ShippingError(unavailable);
  return amount;
}

function quoteShipment(items, products, destinationCountry, config, now = new Date()) {
  if (!countries.includes(destinationCountry)) throw new ShippingError(unavailable);
  if (!Number.isFinite(config.thbPerUsd) || config.thbPerUsd <= 0 || !config.version) {
    throw new ShippingError('Shipping is temporarily unavailable. Please contact us.');
  }
  const international = destinationCountry !== 'Thailand';
  const expiry = config.ratesVerifiedUntil && new Date(config.ratesVerifiedUntil);
  if (international && (!config.enabledCountries?.includes(destinationCountry) || !expiry || !Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime() + 31 * 60 * 1000)) {
    throw new ShippingError(unavailable);
  }

  const cart = normalizeCart(items);
  const productMap = new Map(products.map(product => [String(product._id), product]));
  let netGrams = 0;
  let unitPackingGrams = 0;
  let totalUnits = 0;
  const orderItems = cart.map(item => {
    const product = productMap.get(item.product);
    if (!product) throw new ShippingError('A product is no longer available. Please update your cart.', 404);
    if (product.isOutOfStock) throw new ShippingError(`${product.name} is out of stock.`, 409);
    if (!Number.isFinite(product.weight) || product.weight <= 0 || product.weight > 30) {
      throw new ShippingError(`Please contact us to confirm shipping for ${product.name}.`);
    }
    if (international) {
      // Standard EMS parcels cannot carry matches or lighters. Approval flags
      // must never override this for the existing Matches / Zippo catalogue.
      if (/\b(match(?:es)?|lighter|zippo)\b/i.test(product.name) || !product.internationalShippingCountries?.includes(destinationCountry)) {
        throw new ShippingError(`${product.name} cannot be shipped to ${destinationCountry}. Please remove it or contact us.`);
      }
      if (!Number.isSafeInteger(product.shippingPackagingGrams) || product.shippingPackagingGrams < 0) {
        throw new ShippingError(`Please contact us to confirm shipping for ${product.name}.`);
      }
      unitPackingGrams += product.shippingPackagingGrams * item.quantity;
    }
    netGrams += Math.ceil(product.weight * 1000) * item.quantity;
    totalUnits += item.quantity;
    return {
      product: item.product,
      quantity: item.quantity,
      name: product.name,
      price: roundProductPrice(product.price),
      weight: product.weight,
      image: product.images?.[0]
    };
  });

  let packingProfile = null;
  let grossGrams = netGrams;
  let postage;
  if (international) {
    const profiles = (config.packingProfiles || []).filter(profile =>
      profile.id && Number.isSafeInteger(profile.maxNetGrams) && Number.isSafeInteger(profile.maxUnits) &&
      Number.isSafeInteger(profile.outerPackagingGrams) && profile.outerPackagingGrams > 0 &&
      totalUnits <= profile.maxUnits && netGrams <= profile.maxNetGrams &&
      cart.every(item => profile.productIds?.includes(item.product))
    ).sort((a, b) => a.outerPackagingGrams - b.outerPackagingGrams);
    packingProfile = profiles[0];
    if (!packingProfile) throw new ShippingError('Please contact us for a shipping quote for this combination of products.');
    grossGrams += unitPackingGrams + packingProfile.outerPackagingGrams;
    postage = postageThb(destinationCountry, grossGrams);
  } else {
    if (netGrams > 30000) throw new ShippingError('Please contact us for bulk shipping.');
    postage = config.domesticPostageThb;
    if (!Number.isFinite(postage) || postage <= 0) throw new ShippingError(unavailable);
  }

  // Shipping remains a separate, once-per-order charge, in exact USD cents.
  // Round conversion UP one cent to cover the published THB postage.
  const shippingCents = Math.ceil(postage * 100 / config.thbPerUsd);
  const subtotalCents = orderItems.reduce((sum, item) => sum + item.price * 100 * item.quantity, 0);
  const snapshot = {
    destinationCountry,
    orderItems,
    subtotal: subtotalCents / 100,
    shippingCost: shippingCents / 100,
    postageThb: postage,
    thbPerUsd: config.thbPerUsd,
    netGrams,
    grossGrams,
    packagingGrams: grossGrams - netGrams,
    packingProfile: packingProfile?.id || 'domestic-flat-rate',
    packingVersion: config.version,
    tariffVersion: international ? tariff.version : 'domestic-flat-rate',
    service: international ? 'EMS World Merchandise' : 'Domestic Shipping'
  };
  const quoteId = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { ...snapshot, quoteId };
}

function assertAcceptedQuote(quote, accepted) {
  if (accepted.quoteId !== quote.quoteId || accepted.shippingCost !== quote.shippingCost || accepted.subtotal !== quote.subtotal) {
    throw new ShippingError('Prices or shipping have changed. Please refresh your shipping quote and review your total.', 409);
  }
}

async function loadShippingQuote(items, destinationCountry) {
  const Product = require('../models/Product');
  const cart = normalizeCart(items);
  const products = await Product.find({ _id: { $in: cart.map(item => item.product) } }).lean();
  return quoteShipment(cart, products, destinationCountry, readShippingConfig());
}

module.exports = { ShippingError, countries, normalizeCart, postageThb, quoteShipment, assertAcceptedQuote, loadShippingQuote };
