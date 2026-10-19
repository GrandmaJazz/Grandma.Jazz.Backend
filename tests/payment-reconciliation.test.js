const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconcileOrderPayment } = require('../src/services/orderPaymentReconciliation');

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const user = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const date = new Date('2026-10-19T00:00:00Z');
const session = {
  id: 'cs_test_fixture', mode: 'payment', status: 'complete', currency: 'usd',
  amount_total: 5400, payment_status: 'paid', payment_intent: 'pi_fixture',
  metadata: { type: 'order', orderId: id, quoteId: 'quote-fixture' },
};
function fixture(overrides = {}) {
  let order = { _id: id, user, totalAmount: 54, checkoutQuote: { totalCents: 5400, quoteId: 'quote-fixture' },
    status: 'pending', isPaid: false, discountCode: 'SAVE', ...overrides };
  const calls = { mutations: 0, notifications: 0, discounts: [] };
  const deps = {
    Order: {
      findById: async target => target === id ? structuredClone(order) : null,
      findOneAndUpdate: async (filter, update) => {
        // Synchronous compare-and-set models the database's single-document
        // atomic operation; no production DB or Stripe request is involved.
        if (order.isPaid || order.status !== filter.status) return null;
        assert.deepEqual(filter.isPaid, { $ne: true });
        order = { ...order, ...update.$set }; calls.mutations++;
        return structuredClone(order);
      },
    },
    Discount: { updateOne: async (filter, update) => {
      assert.deepEqual(filter, { code: 'SAVE' });
      assert.deepEqual(update, { $addToSet: { usedBy: user } });
      if (!calls.discounts.includes(update.$addToSet.usedBy)) calls.discounts.push(update.$addToSet.usedBy);
    } },
    now: () => date,
    notify: async () => { calls.notifications++; },
  };
  return { deps, calls, get order() { return order; } };
}
test('unpaid sessions cannot become paid, and ownership is checked even for unpaid sessions', async () => {
  const f = fixture();
  assert.deepEqual(await reconcileOrderPayment({ ...session, payment_status: 'unpaid' }, f.deps, user), { success: false });
  for (const payment_status of ['paid', 'unpaid']) {
    await assert.rejects(reconcileOrderPayment({ ...session, payment_status }, f.deps, 'another-user'), { status: 403 });
  }
  assert.equal(f.calls.mutations, 0); assert.equal(f.calls.notifications, 0);
});
test('rejects wrong payment type, missing orders and mismatched authoritative totals/quote', async () => {
  const f = fixture();
  for (const changes of [
    { metadata: {} }, { metadata: { type: 'ticket', orderId: id } },
    { metadata: { ...session.metadata, orderId: 'bad' } },
    { metadata: { ...session.metadata, quoteId: 'different' } },
    { currency: 'thb' }, { amount_total: 5399 }, { amount_total: '5400' },
    { mode: 'subscription' }, { status: 'open' }, { payment_intent: null },
  ]) await assert.rejects(reconcileOrderPayment({ ...session, ...changes }, f.deps, user));
  await assert.rejects(reconcileOrderPayment({ ...session, metadata: { ...session.metadata, orderId: 'cccccccccccccccccccccccc' } }, f.deps, user), { status: 404 });
  assert.equal(f.calls.mutations, 0);
});
test('simultaneous webhook and browser reconciliation pay once and cannot duplicate notifications', async () => {
  const f = fixture(); f.deps.notificationsEnabled = true;
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    reconcileOrderPayment(session, f.deps, i % 2 ? user : undefined)));
  assert.ok(results.every(result => result.success && result.order.isPaid));
  assert.equal(f.calls.mutations, 1); assert.equal(f.calls.notifications, 1);
  assert.deepEqual(f.calls.discounts, [user]);
  assert.equal(f.order.paymentId, 'pi_fixture'); assert.equal(+f.order.paidAt, +date);
});
test('payment emails stay deferred unless explicitly enabled', async () => {
  const f = fixture();
  assert.equal((await reconcileOrderPayment(session, f.deps, user)).success, true);
  assert.equal(f.calls.notifications, 0);
});
test('repeat verification preserves original paid date and shipped/delivered fulfilment', async () => {
  for (const status of ['shipped', 'delivered']) {
    const originalDate = new Date('2026-10-17T12:00:00Z');
    const f = fixture({ status, isPaid: true, paymentId: 'pi_fixture', paidAt: originalDate });
    f.deps.notificationsEnabled = true;
    const result = await reconcileOrderPayment(session, f.deps, user);
    assert.equal(result.order.status, status); assert.equal(+result.order.paidAt, +originalDate);
    assert.equal(f.calls.mutations, 0); assert.equal(f.calls.notifications, 0);
  }
});
test('first reconciliation also preserves pre-existing fulfilment state', async () => {
  for (const status of ['shipped', 'delivered']) {
    const f = fixture({ status });
    assert.equal((await reconcileOrderPayment(session, f.deps, user)).order.status, status);
  }
});
test('a different second payment is rejected rather than overwriting the first', async () => {
  const f = fixture(); await reconcileOrderPayment(session, f.deps, user);
  await assert.rejects(reconcileOrderPayment({ ...session, payment_intent: 'pi_other' }, f.deps, user), /different payment/);
  assert.equal(f.order.paymentId, 'pi_fixture'); assert.equal(f.calls.mutations, 1);
});
test('legacy orders still require their saved USD amount rather than bypassing amount validation', async () => {
  const f = fixture({ checkoutQuote: undefined });
  await assert.rejects(reconcileOrderPayment({ ...session, amount_total: 5401 }, f.deps, user), /saved order/);
  assert.equal((await reconcileOrderPayment(session, f.deps, user)).success, true);
});
test('concurrent status edits produce a retryable conflict rather than overwriting fulfilment', async () => {
  const f = fixture(); f.deps.Order.findOneAndUpdate = async () => null;
  await assert.rejects(reconcileOrderPayment(session, f.deps, user), { status: 409 });
  assert.equal(f.calls.notifications, 0);
});
test('a retry repairs failed discount bookkeeping without repeating the paid transition', async () => {
  const f = fixture(); const update = f.deps.Discount.updateOne; let first = true;
  f.deps.Discount.updateOne = async (...args) => { if (first) { first = false; throw new Error('database temporarily unavailable'); } return update(...args); };
  await assert.rejects(reconcileOrderPayment(session, f.deps, user), /temporarily/);
  assert.equal(f.order.isPaid, true);
  assert.equal((await reconcileOrderPayment(session, f.deps, user)).success, true);
  assert.equal(f.calls.mutations, 1); assert.deepEqual(f.calls.discounts, [user]);
});
