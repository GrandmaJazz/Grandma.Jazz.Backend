const Ticket = require('../models/Ticket');
const Event = require('../models/Event');

class TicketExpirationService {
  
  // Check and expire pending tickets that are past their expiration time
  static async expireOverdueTickets() {
    try {
      const now = new Date();
      
      // Find all pending tickets that have expired
      const expiredTickets = await Ticket.find({
        status: 'pending',
        expiresAt: { $lt: now }
      }).populate('event');

      console.log(`Found ${expiredTickets.length} expired tickets to process`);

      for (const ticket of expiredTickets) {
        // Update ticket status to expired
        ticket.status = 'expired';
        await ticket.save();

        // Decrease sold tickets count from the event
        await Event.findByIdAndUpdate(ticket.event._id, {
          $inc: { soldTickets: -ticket.quantity }
        });

        console.log(`Expired ticket ${ticket.ticketNumber} and freed ${ticket.quantity} tickets for event ${ticket.event.title}`);
      }

      return {
        success: true,
        expiredCount: expiredTickets.length,
        message: `Processed ${expiredTickets.length} expired tickets`
      };
    } catch (error) {
      console.error('Error expiring overdue tickets:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get tickets that will expire soon (within next hour)
  static async getTicketsExpiringSoon() {
    try {
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      
      const expiringSoonTickets = await Ticket.find({
        status: 'pending',
        expiresAt: { 
          $gte: new Date(),
          $lte: oneHourFromNow 
        }
      }).populate('event user');

      return {
        success: true,
        tickets: expiringSoonTickets
      };
    } catch (error) {
      console.error('Error fetching tickets expiring soon:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Start automatic cleanup process
  static startAutomaticCleanup() {
    // Run cleanup every 10 minutes
    const cleanupInterval = 10 * 60 * 1000; // 10 minutes
    
    console.log('Starting automatic ticket expiration cleanup...');
    
    // Run immediately
    this.expireOverdueTickets();
    
    // Then run every 10 minutes
    setInterval(() => {
      this.expireOverdueTickets();
    }, cleanupInterval);
  }

  // Manual cleanup function for admin use
  static async manualCleanup() {
    console.log('Running manual ticket expiration cleanup...');
    return await this.expireOverdueTickets();
  }
}

module.exports = TicketExpirationService; 