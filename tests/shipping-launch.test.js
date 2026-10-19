const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateShipping, buildQuote, defaultConfig: config } = require('../src/services/checkoutQuote');
const now = new Date('2026-10-19T05:00:00Z');
const tee = '6aaa37d4af0110889be25e6c';
const coffee = '6aaa3a0faf0110889be25f00';
const products = [tee, coffee].map(_id => ({_id, name:_id===tee?'T-shirt':'Coffee beans',price:40,weight:0.25,images:['https://example.com/product.jpg']}));
const deps = {now,findProducts:async()=>products,findDiscount:async()=>null};

test('reviewed UK/DE/FR/AU carrier cells and BOT conversion match the published sources', () => {
  // Current linked EMS table, merchandise 250/500/1000/2000g columns; one 200g allowance.
  for (const [country, expected] of [['United Kingdom',[1190,1280,1380,1730]],['Germany',[1190,1280,1380,1730]],['France',[1760,1840,2020,2390]],['Australia',[1760,1840,2020,2390]]]) {
    for (const [i, weight] of [50,300,800,1800].entries()) {
      const q = calculateShipping(country,weight,config,now);
      assert.equal(q.rateThb,expected[i]);
      assert.equal(q.shippingCents,Math.round(expected[i]*100/33.541));
    }
  }
  assert.equal(calculateShipping('United Kingdom',29800,config,now).packedWeightGrams,30000);
  assert.equal(calculateShipping('Australia',19800,config,now).packedWeightGrams,20000);
  assert.throws(()=>calculateShipping('Australia',19801,config,now),/weight limit/);
});
test('unreviewed destinations, import-sensitive items and expired overseas rates cannot reach payment', async () => {
  for (const country of ['United States of America','Argentina','Israel','Slovakia','Singapore']) assert.throws(()=>calculateShipping(country,100,config,now),/contact the shop/);
  await assert.rejects(buildQuote({orderItems:[{product:coffee,quantity:1}],destinationCountry:'United Kingdom'},'user',deps),/contents check/);
  assert.throws(()=>calculateShipping('United Kingdom',100,config,new Date('2026-11-19T00:00:00Z')),/review/);
  assert.equal(calculateShipping('Thailand',100,config,new Date('2026-11-20T00:00:00Z')).rateThb,50);
});
test('T-shirt size is required, retained and included in the accepted payment quote', async () => {
  const base={orderItems:[{product:tee,quantity:1}],destinationCountry:'United Kingdom'};
  for (const size of [undefined,'XS','XXXL','m','<script>']) await assert.rejects(buildQuote({...base,orderItems:[{product:tee,quantity:1,size}]},'user',deps),/Choose a T-shirt size/);
  const quotes=[];
  for (const size of ['S','M','L','XL','XXL']) {
    const q=await buildQuote({...base,orderItems:[{product:tee,quantity:1,size,price:0,weight:0}]},'user',deps);
    assert.equal(q.orderItems[0].size,size);assert.equal(q.orderItems[0].name,'T-shirt · '+size);assert.equal(q.subtotalCents,4000);quotes.push(q.quoteId);
  }
  assert.equal(new Set(quotes).size,5);
  await assert.rejects(buildQuote({...base,orderItems:[{product:tee,quantity:1,size:'S'},{product:tee,quantity:1,size:'M'}]},'user',deps),/one T-shirt size/);
});
