const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildQuote, calculateShipping, assertQuoteAccepted, defaultConfig } = require('../src/services/checkoutQuote');
const { paymentConfig, createPaymentSession } = require('../src/services/checkoutPayment');
const now = new Date('2026-09-17T00:00:00Z');
const config = { ...defaultConfig, enabledDestinations: undefined, internationalProductIds: undefined, thbPerUsd: 33.28, reviewDueAt: '2099-01-01' };
const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const product = { _id: id, name: 'T-shirt', price: 39.06, weight: 0.3, images: ['https://example.com/t.jpg'] };
const input = { orderItems: [{ product: id, quantity: 2, price: 0, weight: 0 }], destinationCountry: 'United Kingdom', shippingCost: 0 };
const deps = { config, now, findProducts: async () => [product], findDiscount: async () => null };
test('server prices, quantities and one packaging allowance drive the entire quote', async () => {
 const q = await buildQuote(input, 'user', deps);
 assert.equal(q.subtotalCents, 7812);
 assert.equal(q.shipping.productWeightGrams, 600);
 assert.equal(q.shipping.packedWeightGrams, 800);
 assert.equal(q.shipping.rateThb, 1380);
 assert.equal(q.shipping.shippingCents, 4147);
 assert.equal(q.totalCents, 11959);
 assert.equal(q.orderItems[0].price, 39.06);
 assertQuoteAccepted(q, q.quoteId);
 assert.throws(() => assertQuoteAccepted(q, 'stale'), /changed/);
});
test('weight bands include packaging and round up without skipping a band', () => {
 assert.equal(calculateShipping('United Kingdom', 50, config, now).rateThb, 1190);
 assert.equal(calculateShipping('United Kingdom', 51, config, now).rateThb, 1280);
 assert.equal(calculateShipping('United Kingdom', 300, config, now).rateThb, 1280);
 assert.equal(calculateShipping('United Kingdom', 301, config, now).rateThb, 1380);
 assert.equal(calculateShipping('Thailand', 100, config, now).shippingCents, 150);
 assert.equal(calculateShipping('United Kingdom', 29800, config, now).packedWeightGrams, 30000);
 for (const country of ['Thailand', 'United Kingdom']) assert.throws(() => calculateShipping(country, 29801, config, now), /30 kg/);
 for (const country of ['Australia', 'Argentina', 'Denmark', 'Israel', 'Myanmar', 'Philippines', 'Poland', 'Sweden']) assert.throws(() => calculateShipping(country, 19801, config, now), /unavailable/);
 assert.equal(calculateShipping('United States of America', 100, config, now).rateThb, 1980);
 assert.equal(calculateShipping('Singapore', 50, config, now).rateThb, 770);
 for (const country of ['', 'Atlantis', '__proto__', 'constructor']) assert.throws(() => calculateShipping(country, 100, config, now));
 for (const weight of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => calculateShipping('Thailand', weight, config, now));
 assert.throws(() => calculateShipping('United Kingdom', 100, {...config, reviewDueAt:'2020-01-01'}, now), /review/);
});
test('rejects malformed carts and missing/unavailable/unweighed products', async () => {
 for (const quantity of [0, -1, 1.5, 100, '2', NaN, Infinity]) {
  await assert.rejects(buildQuote({...input, orderItems:[{product:id,quantity}]}, 'user', deps));
 }
 for (const orderItems of [[], null, {}, [{product:'bad',quantity:1}], [{product:id,quantity:60},{product:id,quantity:60}]])
  await assert.rejects(buildQuote({...input,orderItems}, 'user', deps));
 await assert.rejects(buildQuote(input, 'user', {...deps, findProducts:async()=>[]}), /no longer exists/);
 for (const bad of [{isOutOfStock:true}, {weight:0}, {weight:NaN}, {price:NaN}, {price:-1}])
  await assert.rejects(buildQuote(input, 'user', {...deps,findProducts:async()=>[{...product,...bad}]}));
});
test('duplicate product IDs aggregate and a changed catalogue invalidates the accepted quote', async () => {
 const q = await buildQuote({...input,orderItems:[{product:id,quantity:1},{product:id.toUpperCase(),quantity:1}]},'user',deps);
 assert.equal(q.orderItems.length,1);
 const changed = await buildQuote(input,'user',{...deps,findProducts:async()=>[{...product,price:40}]});
 assert.throws(()=>assertQuoteAccepted(changed,q.quoteId), /changed/);
 const country = await buildQuote({...input,destinationCountry:'Thailand'},'user',deps);
 assert.notEqual(q.quoteId,country.quoteId);
});
test('discount is server verified, rounded and capped at products only', async () => {
 const discount = {code:'SAVE',value:10,discountType:'percentage',isValid:()=>({valid:true}),hasUserUsed:()=>false};
 const q = await buildQuote({...input,discountCode:'save'},'user',{...deps,findDiscount:async()=>discount});
 assert.equal(q.discountCents,781);
 assert.equal(q.totalCents,11178);
 const all = await buildQuote({...input,discountCode:'save'},'user',{...deps,findDiscount:async()=>({...discount,value:200})});
 assert.equal(all.totalCents,all.shipping.shippingCents);
 await assert.rejects(buildQuote({...input,discountCode:'save'},'user',deps),/not found/);
 await assert.rejects(buildQuote({...input,discountCode:'save'},'user',{...deps,findDiscount:async()=>({...discount,hasUserUsed:()=>true})}),/already used/);
 await assert.rejects(buildQuote({...input,discountCode:'save'},'user',{...deps,findDiscount:async()=>({...discount,isValid:()=>({valid:false,message:'Expired'})})}),/Expired/);
});
test('Stripe charges one shipping fee and the displayed total; coupon failure never charges full price', async () => {
 const q=await buildQuote(input,'user',deps);
 const payment=paymentConfig(q,'order','https://grandmajazz.com');
 assert.equal(payment.shipping_options.length,1);
 const total=payment.line_items.reduce((s,i)=>s+i.price_data.unit_amount*i.quantity,0)+payment.shipping_options[0].shipping_rate_data.fixed_amount.amount;
 assert.equal(total,q.totalCents);
 let sessions=0;
 const stripe={coupons:{create:async()=>{throw new Error('Stripe unavailable');}},checkout:{sessions:{create:async()=>{sessions++;}}}};
 await assert.rejects(createPaymentSession(stripe,{...q,discountCents:100,discountCode:'SAVE'},'order','https://grandmajazz.com'),/unavailable/);
 assert.equal(sessions,0);
});
test('all rate bands and supported countries yield positive finite cents or explicit unavailability', () => {
 for (const country of Object.keys(config.countryZones)) {
  for (const row of config.rates) {
   try {
    const q=calculateShipping(country, row.upToGrams-config.packagingGrams,config,now);
    assert.ok(Number.isSafeInteger(q.shippingCents)&&q.shippingCents>0);
   } catch(error) { assert.match(error.message,/unavailable/); }
  }
 }
});

test('audited carrier cells match the archived official tariff', () => {
 for (const [grams, zone, thb] of [[12000,3,5250],[15500,3,6400],[21000,6,6630],[28500,7,16160],[27500,17,19430]]) {
  assert.equal(config.rates.find(row => row.upToGrams === grams).thb[zone-1], thb);
 }
});
