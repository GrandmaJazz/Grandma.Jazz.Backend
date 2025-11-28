//backend/src/controllers/uploadController.js
const asyncHandler = require('express-async-handler');
const { uploaders, getS3FileUrl } = require('../config/awsS3');

// @desc    อัปโหลดไฟล์รูปภาพไปยัง S3
// @route   POST /api/upload
// @access  Private/Admin
const uploadFile = asyncHandler(async (req, res) => {
  // ใช้ imageUpload สำหรับอัปโหลดรูปภาพเดียว
  uploaders.imageUpload.single('image')(req, res, function(error) {
    if (error) {
      // จัดการข้อผิดพลาดจาก multer
      if (error.message && error.message.includes('File too large')) {
        return res.status(400).json({
          success: false,
          message: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด'
      });
    }
    
    // สร้าง URL สำหรับเข้าถึงไฟล์จาก S3
    const fileUrl = req.file.location; // multer-s3 จะใส่ location ให้อัตโนมัติ
    
    res.status(201).json({
      success: true,
      message: 'อัปโหลดไฟล์สำเร็จ',
      file: {
        filename: req.file.key, // S3 key
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
        s3Key: req.file.key,
        bucket: req.file.bucket
      }
    });
  });
});

// @desc    อัปโหลดหลายไฟล์รูปภาพไปยัง S3
// @route   POST /api/upload/multiple
// @access  Private/Admin  
const uploadMultipleFiles = asyncHandler(async (req, res) => {
  // ใช้ imageUpload สำหรับอัปโหลดหลายไฟล์ (สูงสุด 10 ไฟล์)
  uploaders.imageUpload.array('images', 10)(req, res, function(error) {
    if (error) {
      // จัดการข้อผิดพลาดจาก multer
      if (error.message && error.message.includes('File too large')) {
        return res.status(400).json({
          success: false,
          message: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB ต่อไฟล์)'
        });
      }
      
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          message: 'จำนวนไฟล์มากเกินไป (สูงสุด 10 ไฟล์)'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์'
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด'
      });
    }
    
    // สร้างข้อมูลไฟล์สำหรับ response
    const files = req.files.map(file => ({
      filename: file.key, // S3 key
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: file.location, // URL จาก S3
      s3Key: file.key,
      bucket: file.bucket
    }));
    
    res.status(201).json({
      success: true,
      message: 'อัปโหลดไฟล์สำเร็จ',
      files
    });
  });
});

// @desc    อัปโหลดไฟล์วิดีโอไปยัง S3
// @route   POST /api/upload/video
// @access  Private/Admin
const uploadVideo = asyncHandler(async (req, res) => {
  uploaders.videoUpload.single('video')(req, res, function(error) {
    if (error) {
      if (error.message && error.message.includes('File too large')) {
        return res.status(400).json({
          success: false,
          message: 'ไฟล์วิดีโอมีขนาดใหญ่เกินไป (สูงสุด 100MB)'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการอัปโหลดวิดีโอ'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกไฟล์วิดีโอที่ต้องการอัปโหลด'
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'อัปโหลดวิดีโอสำเร็จ',
      file: {
        filename: req.file.key,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: req.file.location,
        s3Key: req.file.key,
        bucket: req.file.bucket
      }
    });
  });
});

// @desc    อัปโหลดไฟล์เพลงไปยัง S3
// @route   POST /api/upload/music
// @access  Private/Admin
const uploadMusic = asyncHandler(async (req, res) => {
  uploaders.musicUpload.single('audio')(req, res, function(error) {
    if (error) {
      if (error.message && error.message.includes('File too large')) {
        return res.status(400).json({
          success: false,
          message: 'ไฟล์เพลงมีขนาดใหญ่เกินไป (สูงสุด 20MB)'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการอัปโหลดเพลง'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกไฟล์เพลงที่ต้องการอัปโหลด'
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'อัปโหลดเพลงสำเร็จ',
      file: {
        filename: req.file.key,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: req.file.location,
        s3Key: req.file.key,
        bucket: req.file.bucket
      }
    });
  });
});

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  uploadVideo,
  uploadMusic
};