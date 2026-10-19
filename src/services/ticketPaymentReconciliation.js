const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const ownerId = user => String(user?._id || user || '');

async function reconcileTicketPayment(session, Ticket, requestingUserId) {
  if (session?.metadata?.type !== 'ticket' || !/^[a-f\d]{24}$/i.test(session.metadata.ticketId || '')) {
    fail('This is not a ticket payment.', 400);
  }
  const ticket = await Ticket.findById(session.metadata.ticketId);
  if (!ticket) fail('Ticket not found.', 404);
  if (requestingUserId !== undefined && ownerId(ticket.user) !== ownerId(requestingUserId)) {
    fail('You cannot verify payment for this ticket.', 403);
  }
  if (session.payment_status !== 'paid') return { success: false };
  const cents = Math.round(ticket.totalAmount * 100);
  const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (session.mode !== 'payment' || session.status !== 'complete' || session.currency !== 'usd' ||
      !Number.isSafeInteger(cents) || cents <= 0 || session.amount_total !== cents || !paymentId) {
    fail('Payment details do not match the saved ticket.');
  }
  if (ticket.status === 'paid') {
    if (ticket.paymentId !== paymentId) fail('A different payment is already recorded for this ticket.');
    return { success: true, ticket };
  }
  const updated = await Ticket.findOneAndUpdate({ _id: ticket._id, status: ticket.status }, {
    $set: { status: 'paid', paymentId, expiresAt: null },
  }, { new: true, runValidators: true });
  const paid = updated || await Ticket.findById(ticket._id);
  if (paid?.status !== 'paid' || paid.paymentId !== paymentId) fail('Ticket changed during verification. Please try again.');
  return { success: true, ticket: paid };
}

module.exports = { reconcileTicketPayment };
