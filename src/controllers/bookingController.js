const Booking = require('../models/Booking');
const Event = require('../models/Event');
const { createCheckoutSession } = require('../services/stripeService');

// Create new booking
const createBooking = async (req, res) => {
  try {
    const { eventId, attendees, totalTickets } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!eventId || !attendees || !totalTickets) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (totalTickets < 1 || totalTickets > 10) {
      return res.status(400).json({ message: 'Total tickets must be between 1 and 10' });
    }

    if (attendees.length !== totalTickets) {
      return res.status(400).json({ message: 'Number of attendees must match total tickets' });
    }

    // Check for duplicate names
    const names = attendees.map(a => `${a.firstName.toLowerCase()} ${a.lastName.toLowerCase()}`);
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      return res.status(400).json({ message: 'Attendee names must be unique' });
    }

    // Get event details
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(400).json({ message: 'Event is not active' });
    }

    // Calculate total amount
    const totalAmount = event.ticketPrice * totalTickets;

    // Create booking
    const booking = new Booking({
      user: userId,
      event: eventId,
      attendees,
      totalTickets,
      totalAmount,
      ticketPrice: event.ticketPrice
    });

    await booking.save();

    // Populate event details for response
    await booking.populate('event', 'title eventDate');

    res.status(201).json({
      success: true,
      booking,
      message: 'Booking created successfully'
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Error creating booking', error: error.message });
  }
};

// Get user's bookings
const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;

    const bookings = await Booking.find({ user: userId })
      .populate('event', 'title eventDate videoPath')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ message: 'Error fetching bookings', error: error.message });
  }
};

// Get booking by ID
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const booking = await Booking.findOne({ _id: id, user: userId })
      .populate('event', 'title eventDate videoPath');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ message: 'Error fetching booking', error: error.message });
  }
};

// Update booking payment status
const updateBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentId } = req.body;
    const userId = req.user.id;

    const booking = await Booking.findOne({ _id: id, user: userId });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.paymentStatus = paymentStatus;
    if (paymentId) {
      booking.paymentId = paymentId;
    }

    await booking.save();

    res.json({
      success: true,
      booking,
      message: 'Payment status updated successfully'
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ message: 'Error updating payment status', error: error.message });
  }
};

// Admin: Get all bookings
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user', 'name email')
      .populate('event', 'title eventDate')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    res.status(500).json({ message: 'Error fetching bookings', error: error.message });
  }
};

// Create Stripe checkout session for booking payment
const createBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get booking details
    const booking = await Booking.findOne({ _id: id, user: userId })
      .populate('event', 'title eventDate')
      .populate('user', 'name surname email phone');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Booking already paid' });
    }

    // Create order items for Stripe
    const orderItems = [{
      name: `Event Ticket: ${booking.event.title}`,
      price: booking.ticketPrice,
      quantity: booking.totalTickets,
      image: '/images/event-ticket.jpg' // Default ticket image
    }];

    // Create checkout session
    const { session } = await createCheckoutSession(
      orderItems,
      userId,
      `Event: ${booking.event.title}`, // Use event title as shipping address
      booking.user.phone || ''
    );

    // Update booking with session info
    booking.stripeSessionId = session.id;
    await booking.save();

    res.json({
      success: true,
      sessionUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating booking payment:', error);
    res.status(500).json({ message: 'Error creating payment session', error: error.message });
  }
};

// Verify booking payment
const verifyBookingPayment = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;

    // Find booking by session ID
    const booking = await Booking.findOne({ 
      stripeSessionId: sessionId, 
      user: userId 
    }).populate('event', 'title eventDate');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Update payment status
    booking.paymentStatus = 'paid';
    booking.paidAt = new Date();
    await booking.save();

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Error verifying booking payment:', error);
    res.status(500).json({ message: 'Error verifying payment', error: error.message });
  }
};

module.exports = {
  createBooking,
  getUserBookings,
  getBookingById,
  updateBookingPayment,
  getAllBookings,
  createBookingPayment,
  verifyBookingPayment
}; 