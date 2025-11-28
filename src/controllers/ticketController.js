const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const TicketExpirationService = require('../services/ticketExpirationService');
const { createTicketCheckoutSession, verifyTicketPayment } = require('../services/stripeService');
// Create new ticket booking
const createTicket = async (req, res) => {
  try {
    const { eventId, attendees, quantity } = req.body;
    const userId = req.user.id;

    // Validate event exists and is active
    const event = await Event.findById(eventId);
    if (!event || !event.isActive) {
      return res.status(404).json({ message: 'Event not found or not active' });
    }

    // Check if event date has passed
    const now = new Date();
    const eventDate = new Date(event.eventDate);
    if (eventDate < now) {
      return res.status(400).json({ message: 'Cannot book tickets for past events. This event has already occurred.' });
    }

    // Check if event is sold out
    if (event.isSoldOut) {
      return res.status(400).json({ message: 'Event is sold out' });
    }

    // Check if enough tickets are available
    const availableTickets = event.availableTickets;
    if (quantity > availableTickets) {
      return res.status(400).json({ 
        message: `Only ${availableTickets} tickets available. Cannot book ${quantity} tickets.` 
      });
    }

    // Validate quantity
    if (quantity < 1 || quantity > 10) {
      return res.status(400).json({ message: 'Quantity must be between 1 and 10' });
    }

    // Validate attendees count matches quantity
    if (attendees.length !== quantity) {
      return res.status(400).json({ message: 'Number of attendees must match quantity' });
    }

    // Check for duplicate names
    const names = attendees.map(a => `${a.firstName} ${a.lastName}`.toLowerCase());
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      return res.status(400).json({ message: 'Attendee names must be unique' });
    }

    // Calculate total amount
    const totalAmount = event.ticketPrice * quantity;

    // Create ticket
    const ticket = new Ticket({
        event: eventId,
        user: userId,
        attendees,
        quantity,
        totalAmount,
        ticketNumber: `TKT-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      });

    await ticket.save();

    // Update sold tickets count
    await Event.findByIdAndUpdate(eventId, {
      $inc: { soldTickets: quantity }
    });
    
    // Populate event details
    await ticket.populate('event', 'title eventDate ticketPrice totalTickets soldTickets availableTickets isSoldOut');
    
    res.status(201).json({
      success: true,
      ticket,
      message: 'Ticket booking created successfully'
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Error creating ticket booking', error: error.message });
  }
};

// Get user's tickets
const getUserTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // First, expire any overdue tickets
    await TicketExpirationService.expireOverdueTickets();
    
    const tickets = await Ticket.find({ user: userId })
      .populate('event', 'title eventDate ticketPrice')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    res.status(500).json({ message: 'Error fetching tickets', error: error.message });
  }
};

// Get ticket by ID
const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const ticket = await Ticket.findOne({ _id: id, user: userId })
      .populate('event', 'title eventDate ticketPrice');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if event date has passed
    const now = new Date();
    const eventDate = new Date(ticket.event.eventDate);
    if (eventDate < now) {
      return res.status(400).json({ 
        message: 'Cannot proceed with payment for past events. This event has already occurred.',
        eventPassed: true 
      });
    }

    // Check if ticket is expired
    if (ticket.status === 'pending' && new Date() > ticket.expiresAt) {
      // Expire the ticket
      ticket.status = 'expired';
      await ticket.save();
      
      // Decrease sold tickets count
      await Event.findByIdAndUpdate(ticket.event._id, {
        $inc: { soldTickets: -ticket.quantity }
      });
      
      return res.status(400).json({ 
        message: 'This ticket has expired. Please book a new ticket.',
        expired: true 
      });
    }

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ message: 'Error fetching ticket', error: error.message });
  }
};

// Update ticket status (for payment completion)
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentId } = req.body;

    const updateData = { status };
    if (paymentId) {
      updateData.paymentId = paymentId;
    }

    const ticket = await Ticket.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('event', 'title eventDate ticketPrice');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({
      success: true,
      ticket,
      message: 'Ticket status updated successfully'
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ message: 'Error updating ticket status', error: error.message });
  }
};

// Cancel ticket
const cancelTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const ticket = await Ticket.findOne({ _id: id, user: userId });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (ticket.status === 'paid') {
      return res.status(400).json({ message: 'Cannot cancel paid ticket' });
    }

    if (ticket.status === 'cancelled') {
      return res.status(400).json({ message: 'Ticket is already cancelled' });
    }

    if (ticket.status === 'expired') {
      return res.status(400).json({ message: 'Ticket has already expired' });
    }

    ticket.status = 'cancelled';
    await ticket.save();

    // Decrease sold tickets count
    await Event.findByIdAndUpdate(ticket.event, {
      $inc: { soldTickets: -ticket.quantity }
    });

    res.json({
      success: true,
      message: 'Ticket cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling ticket:', error);
    res.status(500).json({ message: 'Error cancelling ticket', error: error.message });
  }
};

// Admin: Get all tickets
const getAllTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate('event', 'title eventDate ticketPrice')
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    console.error('Error fetching all tickets:', error);
    res.status(500).json({ message: 'Error fetching tickets', error: error.message });
  }
};

// Create checkout session for ticket
const createTicketCheckout = async (req, res) => {
    try {
      const { ticketId } = req.body;
      const userId = req.user.id;
  
      if (!ticketId) {
        return res.status(400).json({ message: 'Ticket ID is required' });
      }
  
      // สร้าง checkout session
      const { session, ticket } = await createTicketCheckoutSession(ticketId, userId);
  
      res.status(200).json({
        success: true,
        sessionId: session.id,
        sessionUrl: session.url,
        ticket: {
          _id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          totalAmount: ticket.totalAmount,
          status: ticket.status
        }
      });
    } catch (error) {
      console.error('Error creating ticket checkout:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error creating ticket checkout session', 
        error: error.message 
      });
    }
  };
  
  // Verify ticket payment
  const verifyTicketPaymentStatus = async (req, res) => {
    try {
      const { sessionId } = req.params;
  
      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required' });
      }
  
      const { success, ticket } = await verifyTicketPayment(sessionId);
  
      if (success) {
        res.json({
          success: true,
          paid: true,
          ticket: {
            _id: ticket._id,
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            paymentId: ticket.paymentId
          }
        });
      } else {
        res.json({
          success: true,
          paid: false
        });
      }
    } catch (error) {
      console.error('Error verifying ticket payment:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error verifying ticket payment', 
        error: error.message 
      });
    }
  };
  
  // Manual cleanup of expired tickets (Admin function)
  const cleanupExpiredTickets = async (req, res) => {
    try {
      const result = await TicketExpirationService.manualCleanup();
      
      res.json({
        success: result.success,
        message: result.message || result.error,
        expiredCount: result.expiredCount || 0
      });
    } catch (error) {
      console.error('Error in manual cleanup:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error during cleanup', 
        error: error.message 
      });
    }
  };
  
  // อัปเดต module.exports
  module.exports = {
    createTicket,
    getUserTickets,
    getTicketById,
    updateTicketStatus,
    cancelTicket,
    getAllTickets,
    createTicketCheckout,
    verifyTicketPaymentStatus,
    cleanupExpiredTickets
  };