const Event = require('../models/Event');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/awsS3');

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../../uploads/videos');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'event-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /mp4|webm|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

// Get all events
const getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching events', error: error.message });
  }
};

// Get active event (for frontend display)
const getActiveEvent = async (req, res) => {
  try {
    const event = await Event.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (!event) {
      return res.status(404).json({ message: 'No active event found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching active event', error: error.message });
  }
};

// Get event by ID
const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching event', error: error.message });
  }
};

// Create new event
const createEvent = async (req, res) => {
  try {
    const { title, description, eventDate, eventTime, ticketPrice, totalTickets } = req.body;
    
    const eventData = {
      title,
      description,
      eventDate: new Date(eventDate),
      eventTime: eventTime || '19:00',
      ticketPrice: parseFloat(ticketPrice) || 0,
      totalTickets: parseInt(totalTickets) || 100
    };

    // If video file is uploaded to S3
    if (req.file) {
      eventData.videoPath = req.file.location; // S3 URL
      eventData.videoS3Key = req.file.key; // S3 key for deletion
    }

    const event = new Event(eventData);
    await event.save();
    
    res.status(201).json(event);
  } catch (error) {
    res.status(400).json({ message: 'Error creating event', error: error.message });
  }
};

// Update event
const updateEvent = async (req, res) => {
  try {
    const { title, description, eventDate, eventTime, ticketPrice, totalTickets, isActive } = req.body;
    
    const updateData = {
      title,
      description,
      eventDate: new Date(eventDate),
      eventTime: eventTime || '19:00',
      ticketPrice: parseFloat(ticketPrice) || 0,
      isActive
    };

    // Only update totalTickets if provided and it's not less than soldTickets
    if (totalTickets !== undefined) {
      const currentEvent = await Event.findById(req.params.id);
      const newTotalTickets = parseInt(totalTickets);
      
      if (newTotalTickets < currentEvent.soldTickets) {
        return res.status(400).json({ 
          message: `Cannot set total tickets to ${newTotalTickets}. Already sold ${currentEvent.soldTickets} tickets.` 
        });
      }
      
      updateData.totalTickets = newTotalTickets;
    }

    // If new video file is uploaded to S3
    if (req.file) {
      updateData.videoPath = req.file.location; // S3 URL
      updateData.videoS3Key = req.file.key; // S3 key
      
      // Delete old video from S3 if it exists
      const oldEvent = await Event.findById(req.params.id);
      if (oldEvent && oldEvent.videoS3Key) {
        try {
          const deleteParams = {
            Bucket: bucketName,
            Key: oldEvent.videoS3Key
          };
          await s3Client.send(new DeleteObjectCommand(deleteParams));
        } catch (deleteError) {
          console.error('Error deleting old video from S3:', deleteError);
        }
      }
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    res.status(400).json({ message: 'Error updating event', error: error.message });
  }
};

// Delete event
const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Delete video from S3 if it exists
    if (event.videoS3Key) {
      try {
        const deleteParams = {
          Bucket: bucketName,
          Key: event.videoS3Key
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));
      } catch (deleteError) {
        console.error('Error deleting video from S3:', deleteError);
      }
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting event', error: error.message });
  }
};

// Toggle event active status
const toggleEventStatus = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // If setting this event to active, deactivate all others
    if (!event.isActive) {
      await Event.updateMany({}, { isActive: false });
    }

    event.isActive = !event.isActive;
    await event.save();

    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Error toggling event status', error: error.message });
  }
};

// Get event ticket statistics
const getEventTicketStats = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({
      eventId: event._id,
      totalTickets: event.totalTickets,
      soldTickets: event.soldTickets,
      availableTickets: event.availableTickets,
      isSoldOut: event.isSoldOut,
      isActive: event.isActive
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching event ticket stats', error: error.message });
  }
};

module.exports = {
  getAllEvents,
  getActiveEvent,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  toggleEventStatus,
  getEventTicketStats,
  upload
}; 