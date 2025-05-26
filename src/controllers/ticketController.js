const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const User = require('../models/User');
const { createCheckoutSession } = require('../services/stripeService');

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
    
    // Populate event details
    await ticket.populate('event', 'title eventDate ticketPrice');
    
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

// **🆕 NEW: Convert ticket to order for checkout**
const convertTicketToOrder = async (req, res) => {
    try {
      const { ticketId } = req.params;
      const userId = req.user.id;
  
      // Get ticket data
      const ticket = await Ticket.findOne({ _id: ticketId, user: userId })
        .populate('event', 'title eventDate ticketPrice');
  
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
  
      if (ticket.status !== 'pending') {
        return res.status(400).json({ message: 'Ticket is already processed' });
      }
  
      // Get user data
      const user = await User.findById(userId);
  
      if (!user.profileComplete) {
        return res.status(400).json({ message: 'Please complete your profile before checkout' });
      }
  
      // 🆕 Convert ticket to order items format - แก้ไขใหม่
      const orderItems = [{
        product: ticket.event._id,
        productType: 'Event', // 🆕 ระบุว่าเป็น Event
        name: `${ticket.event.title} - Event Tickets (${ticket.quantity} tickets)`,
        quantity: ticket.quantity,
        price: ticket.event.ticketPrice,
        image: `${process.env.CLIENT_URL || 'http://localhost:3000'}/images/ticket-icon.svg`, // 🆕 ใช้ URL เต็ม
        ticketReference: { // 🆕 เพิ่มข้อมูล ticket
          ticketId: ticketId,
          eventId: ticket.event._id,
          attendees: ticket.attendees,
          isTicketOrder: true
        }
      }];
  
      // Create checkout session using existing stripe service
      const { session, order } = await createCheckoutSession(
        orderItems,
        userId,
        'Event Venue - Details will be provided via email', // 🆕 ใช้ default address
        user.phone
      );
  
      res.json({
        success: true,
        sessionId: session.id,
        sessionUrl: session.url,
        orderId: order._id
      });
  
    } catch (error) {
      console.error('Error converting ticket to order:', error);
      res.status(500).json({ message: 'Error processing ticket checkout', error: error.message });
    }
  };

// Get user's tickets
const getUserTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    
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

    ticket.status = 'cancelled';
    await ticket.save();

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

module.exports = {
  createTicket,
  convertTicketToOrder, 
  getUserTickets,
  getTicketById,
  updateTicketStatus,
  cancelTicket,
  getAllTickets
};