const Ticket = require('../models/Ticket');
const Event = require('../models/Event');

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
      totalAmount
    });

    await ticket.save();
    
    // Populate event details
    await ticket.populate('event', 'title eventDate ticketPrice');
    
    res.status(201).json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ message: 'Error creating ticket', error: error.message });
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
      ticket
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ message: 'Error updating ticket', error: error.message });
  }
};

// Get all tickets (admin only)
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
  getUserTickets,
  getTicketById,
  updateTicketStatus,
  getAllTickets
}; 