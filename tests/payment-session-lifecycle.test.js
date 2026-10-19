const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getOrderCheckoutSession, cancelOrderCheckout } = require('../src/services/checkoutSessionLifecycle');

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const quote = { quoteId: 'quote-fixture', totalCents: 5400, discountCents: 0,
  destinationCountry: 'United Kingdom', orderItems: [{ name: 'Fixture', price: 40, quantity: 1 }],
  shipping: { shippingCents: 1400, service: 'Fixture post' } };
function fixture({ discount = false } = {}) {
  let at = new Date('2026-10-19T00:00:00Z');
  const q = discount ? { ...quote, discountCents: 100, discountCode: 'SAVE', totalCents: 5300 } : quote;
  let order = { _id: id, user: 'owner', isPaid: false, status: 'pending', checkoutQuote: q, checkoutSessionAttempt: 1 };
  const calls = { creates: 0, expires: 0, coupons: 0, onPaid: 0, keys: [] };
  const sessions = new Map(); const requests = new Map(); const coupons = new Map();
  let failSessionSave = false; let waitCreate;
  function matches(filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return value.some(matches);
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('$ne' in value) return order[key] !== value.$ne;
        if ('$exists' in value) return (order[key] !== undefined) === value.$exists;
        if ('$lte' in value) return +order[key] <= +value.$lte;
      }
      return order[key] === value;
    });
  }
  const apply = update => {
    order = { ...order, ...update.$set };
    for (const key of Object.keys(update.$unset || {})) delete order[key];
  };
  const deps = {
    now: () => at, clientUrl: 'https://example.com',
    Order: {
      findOneAndUpdate: async (filter, update) => {
        if (!matches(filter)) return null;
        apply(update); return structuredClone(order);
      },
      updateOne: async (filter, update) => {
        if (!matches(filter)) return { matchedCount: 0 };
        if (failSessionSave && update.$set?.checkoutSessionId) { failSessionSave = false; throw new Error('fixture save timeout'); }
        apply(update); return { matchedCount: 1 };
      },
    },
    onPaid: async () => { calls.onPaid++; order.isPaid = true; order.status = 'paid'; },
    stripe: {
      coupons: { create: async (config, options) => {
        assert.ok(options?.idempotencyKey); const key = options.idempotencyKey;
        if (!coupons.has(key)) { calls.coupons++; coupons.set(key, { id: `coupon_${calls.coupons}` }); }
        return coupons.get(key);
      } },
      checkout: { sessions: {
        create: async (config, options) => {
          assert.ok(options?.idempotencyKey); const key = options.idempotencyKey; calls.keys.push(key);
          if (!requests.has(key)) {
            calls.creates++;
            const session = { id: `cs_test_${calls.creates}`, url: 'https://example.com/payment',
              status: 'open', payment_status: 'unpaid', currency: 'usd', mode: config.mode,
              amount_total: q.totalCents, metadata: config.metadata };
            sessions.set(session.id, session);
            requests.set(key, { config: JSON.stringify(config), session });
          }
          assert.equal(requests.get(key).config, JSON.stringify(config), 'retries use identical Stripe parameters');
          if (waitCreate) await waitCreate;
          return requests.get(key).session;
        },
        retrieve: async key => { assert.ok(sessions.has(key)); return structuredClone(sessions.get(key)); },
        expire: async key => {
          calls.expires++; const session = sessions.get(key);
          if (session.status !== 'open') throw new Error('fixture cannot expire completed payment');
          session.status = 'expired'; return structuredClone(session);
        },
      } },
    },
  };
  return { deps, quote: q, calls, sessions, get order() { return order; },
    setOrder: values => { order = { ...order, ...values }; },
    failSave: () => { failSessionSave = true; },
    pause: () => { let resume; waitCreate = new Promise(resolve => { resume = resolve; }); return () => { waitCreate = null; resume(); }; },
    tick: () => { at = new Date(+at + 61000); },
  };
}
test('retry reuses the existing open session instead of creating another charge opportunity', async () => {
  const f = fixture();
  const first = await getOrderCheckoutSession(id, f.quote, f.deps);
  const retry = await getOrderCheckoutSession(id, f.quote, f.deps);
  assert.equal(retry.session.id, first.session.id); assert.equal(f.calls.creates, 1);
  assert.equal(f.order.checkoutSessionId, first.session.id);
  assert.equal(f.order.checkoutSessionLockToken, undefined);
});
test('concurrent preparation is refused until the current operation releases its atomic lease', async () => {
  const f = fixture(); const resume = f.pause();
  const first = getOrderCheckoutSession(id, f.quote, f.deps);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(getOrderCheckoutSession(id, f.quote, f.deps), { status: 409 });
  resume(); await first; assert.equal(f.calls.creates, 1);
});
test('an expired lock still cannot create two sessions because the Stripe key is stable', async () => {
  const f = fixture(); const resume = f.pause();
  const first = getOrderCheckoutSession(id, f.quote, f.deps).catch(error => error);
  await new Promise(resolve => setImmediate(resolve)); f.tick();
  const replacement = getOrderCheckoutSession(id, f.quote, f.deps);
  await new Promise(resolve => setImmediate(resolve)); resume();
  const [stale, current] = await Promise.all([first, replacement]);
  assert.equal(stale.status, 409); assert.ok(current.session.id);
  assert.equal(f.calls.creates, 1); assert.equal(new Set(f.calls.keys).size, 1);
});
test('only an expired session starts a new persisted attempt', async () => {
  const f = fixture(); const first = await getOrderCheckoutSession(id, f.quote, f.deps);
  f.sessions.get(first.session.id).status = 'expired';
  const second = await getOrderCheckoutSession(id, f.quote, f.deps);
  assert.notEqual(first.session.id, second.session.id);
  assert.equal(f.order.checkoutSessionAttempt, 2); assert.equal(f.calls.creates, 2);
});
test('save-timeout recovery reuses the same session and coupon idempotency keys', async () => {
  const f = fixture({ discount: true }); f.failSave();
  await assert.rejects(getOrderCheckoutSession(id, f.quote, f.deps), /save timeout/);
  await getOrderCheckoutSession(id, f.quote, f.deps);
  assert.equal(f.calls.creates, 1); assert.equal(f.calls.coupons, 1);
  assert.equal(new Set(f.calls.keys).size, 1);
});
test('replacement save failure resumes the persisted attempt instead of incrementing again', async () => {
  const f = fixture(); const first = await getOrderCheckoutSession(id, f.quote, f.deps);
  f.sessions.get(first.session.id).status = 'expired'; f.failSave();
  await assert.rejects(getOrderCheckoutSession(id, f.quote, f.deps), /save timeout/);
  assert.equal(f.order.checkoutSessionAttempt, 2); assert.equal(f.order.checkoutSessionId, undefined);
  await getOrderCheckoutSession(id, f.quote, f.deps);
  assert.equal(f.calls.creates, 2); assert.equal(f.order.checkoutSessionAttempt, 2);
});
test('untracked legacy or changed-quote retries require a new checkout', async () => {
  const f = fixture();
  await assert.rejects(getOrderCheckoutSession(id, { ...f.quote, quoteId: 'changed' }, f.deps), /new checkout/);
  f.setOrder({ checkoutSessionAttempt: undefined });
  await assert.rejects(getOrderCheckoutSession(id, f.quote, f.deps), /new checkout/);
  assert.equal(f.calls.creates, 0);
});
test('a completed paid session reconciles instead of creating a replacement', async () => {
  const f = fixture(); const first = await getOrderCheckoutSession(id, f.quote, f.deps);
  Object.assign(f.sessions.get(first.session.id), { status: 'complete', payment_status: 'paid' });
  await assert.rejects(getOrderCheckoutSession(id, f.quote, f.deps), /already paid/);
  assert.equal(f.calls.onPaid, 1); assert.equal(f.calls.creates, 1); assert.equal(f.order.isPaid, true);
});
test('processing or mismatched sessions never produce a second session', async () => {
  const f = fixture(); const first = await getOrderCheckoutSession(id, f.quote, f.deps);
  const session = f.sessions.get(first.session.id);
  session.status = 'complete';
  await assert.rejects(getOrderCheckoutSession(id, f.quote, f.deps), /still processing/);
  session.status = 'open'; session.amount_total++;
  await assert.rejects(getOrderCheckoutSession(id, f.quote, f.deps), /does not match/);
  assert.equal(f.calls.creates, 1); assert.equal(f.calls.expires, 0);
});
test('cancellation expires the open Stripe session before marking the order cancelled', async () => {
  const f = fixture(); const first = await getOrderCheckoutSession(id, f.quote, f.deps);
  const cancelled = await cancelOrderCheckout(id, f.deps);
  assert.equal(cancelled.status, 'canceled'); assert.equal(f.sessions.get(first.session.id).status, 'expired');
  assert.equal(f.calls.expires, 1);
});
test('failed expiration leaves the order pending; a paid session reconciles and cannot be cancelled', async () => {
  const f = fixture(); const first = await getOrderCheckoutSession(id, f.quote, f.deps);
  f.deps.stripe.checkout.sessions.expire = async () => { throw new Error('fixture Stripe timeout'); };
  await assert.rejects(cancelOrderCheckout(id, f.deps), /Stripe timeout/);
  assert.equal(f.order.status, 'pending');
  Object.assign(f.sessions.get(first.session.id), { status: 'complete', payment_status: 'paid' });
  await assert.rejects(cancelOrderCheckout(id, f.deps), /already paid/);
  assert.equal(f.order.status, 'paid'); assert.equal(f.calls.onPaid, 1);
});
