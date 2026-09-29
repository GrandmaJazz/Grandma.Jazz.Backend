const { test } = require('node:test');
const assert = require('node:assert/strict');
const { productInput } = require('../src/services/productInput');
test('partial price update preserves weight, stock, featured and images', () => {
 assert.deepEqual(productInput({price:39.06},true),{price:39.06});
 assert.deepEqual(productInput({isFeatured:false},true),{isFeatured:false});
});
test('rejects malformed numeric and image inputs before a database write', () => {
 for (const price of ['12abc', '', Infinity, NaN, -1, 0, {}, true]) assert.throws(()=>productInput({price},true));
 for (const weight of ['0', 31, Infinity, '0.5kg']) assert.throws(()=>productInput({weight},true));
 for (const images of [[], [''], ['javascript:alert(1)'], 'https://example.com/img.jpg']) assert.throws(()=>productInput({images},true));
 assert.throws(()=>productInput({isFeatured:'yes'},true));
});
