const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const Discount = require('../src/models/Discount');
const Order = require('../src/models/Order');
const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
let product = {_id:id,name:'T-shirt',price:39.06,weight:0.3,images:['https://example.com/t.jpg']};
let captured;
Product.find = async () => [product];
User.findById = async () => ({profileComplete:true,phone:'test'});
Discount.findOne = async () => null;
const stripePath = require.resolve('../src/services/stripeService');
require.cache[stripePath] = { id:stripePath,filename:stripePath,loaded:true,exports:{
 createCheckoutSession:async quote => {captured=quote;return {session:{id:'test',url:'https://example.com/pay'},order:{_id:id,totalAmount:quote.totalCents/100,shippingCost:quote.shipping.shippingCents/100,status:'pending'}};},
}};
const authPath = require.resolve('../src/middleware/authMiddleware');
require.cache[authPath] = {id:authPath,filename:authPath,loaded:true,exports:{
 protect:(req,res,next)=>{if(req.headers.authorization!=='Bearer test')return res.status(401).end();req.user={_id:id};next();},
 admin:(req,res,next)=>next(), completeProfile:(req,res,next)=>next(),
}};
// Keep time deterministic while exercising the actual controller and route registration.
const shippingConfig = require('../src/config/shipping-rates.json');
shippingConfig.reviewDueAt='2099-01-01';
shippingConfig.internationalProductIds=[id];
const app=express();app.use(express.json());app.use('/api/orders',require('../src/routes/orderRoutes'));
app.use(require('../src/middleware/errorMiddleware').errorHandler);
const server=app.listen(0,'127.0.0.1');
after(()=>server.close());
async function request(path,body,auth=true){
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/orders${path}`,{
  method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:body?JSON.stringify(body):undefined});
 return {status:response.status,body:await response.json().catch(()=>null)};
}
const cart={orderItems:[{product:id,quantity:1,price:0,weight:0}],destinationCountry:'United Kingdom',shippingCost:0};
test('quote endpoint precedes /:id and requires auth; config is public',async()=>{
 assert.equal((await request('/shipping-config',null,false)).status,200);
 assert.equal((await request('/quote',cart,false)).status,401);
 const result=await request('/quote',cart);
 assert.equal(result.status,200);assert.equal(result.body.quote.subtotalCents,3906);
});
test('create endpoint recomputes all values and passes the same total into payment',async()=>{
 const quote=(await request('/quote',cart)).body.quote;
 const result=await request('',{...cart,shippingAddress:'Test address',quoteId:quote.quoteId});
 assert.equal(result.status,201);assert.equal(result.body.order.totalAmount,quote.totalCents/100);
 assert.deepEqual(captured,quote);assert.ok(captured.shipping.shippingCents>0);
 const missing=await request('',{...cart,shippingAddress:'Test address'});
 assert.equal(missing.status,409);
 product={...product,price:40};
 const changed=await request('',{...cart,shippingAddress:'Test address',quoteId:quote.quoteId});
 assert.equal(changed.status,409);
 product={...product,price:39.06};
});
test('API returns actionable validation errors and disallows legacy retry bypass',async()=>{
 assert.equal((await request('/quote',{...cart,orderItems:[{product:id,quantity:-1}]})).status,400);
 Order.findById=async()=>({user:id,isPaid:false,status:'pending'});
 const retry=await request(`/${id}/retry-payment`,{});
 assert.equal(retry.status,409);assert.match(retry.body.message,/new checkout/);
});
