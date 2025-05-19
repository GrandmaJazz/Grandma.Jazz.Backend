const mongoose = require('mongoose');
const { GridFsStorage } = require('multer-gridfs-storage');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;

// Create GridFS storage engine
const storage = new GridFsStorage({
  url: mongoURI,
  options: { useNewUrlParser: true, useUnifiedTopology: true },
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      // สร้างชื่อไฟล์ที่ไม่ซ้ำกัน
      crypto.randomBytes(16, (err, buf) => {
        if (err) return reject(err);
        
        let bucketName = 'uploads';
        
        // กำหนด bucket name ตามประเภทไฟล์
        if (file.fieldname === 'image') {
          bucketName = 'cards';
        } else if (file.fieldname === 'music') {
          bucketName = 'music';
        }
        
        const filename = `${file.fieldname}-${Date.now()}-${buf.toString('hex')}${path.extname(file.originalname)}`;
        
        const fileInfo = {
          filename: filename,
          bucketName: bucketName,
          metadata: {
            originalName: file.originalname,
            mimeType: file.mimetype
          }
        };
        
        resolve(fileInfo);
      });
    });
  }
});

// สร้าง multer upload middleware
const upload = multer({ 
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'image') {
      // เฉพาะไฟล์รูปภาพ
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for card image'), false);
      }
    } else if (file.fieldname === 'music') {
      // เฉพาะไฟล์เสียง
      if (!file.mimetype.startsWith('audio/')) {
        return cb(new Error('Only audio files are allowed for music'), false);
      }
    }
    cb(null, true);
  }
});

module.exports = { upload };