//backend/src/controllers/uploadController.js
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// กำหนดค่าการจัดเก็บไฟล์
const storage = multer.diskStorage({
  destination(req, file, cb) {
    // สร้างโฟลเดอร์ uploads หากยังไม่มี
    const uploadDir = 'uploads/';
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    // กำหนดชื่อไฟล์ให้ไม่ซ้ำกัน
    cb(
      null,
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
    );
  }
});

// ตรวจสอบประเภทไฟล์ (เฉพาะรูปภาพ)
function checkFileType(file, cb) {
  const filetypes = /jpg|jpeg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('รองรับเฉพาะไฟล์รูปภาพเท่านั้น (jpg, jpeg, png, webp)'));
  }
}

// กำหนดค่า multer
const upload = multer({
  storage,
  fileFilter: function(req, file, cb) {
    checkFileType(file, cb);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // จำกัดขนาดไฟล์ 5MB
  }
});

// @desc    อัปโหลดไฟล์
// @route   POST /api/upload
// @access  Private/Admin
const uploadFile = (req, res) => {
  // ใช้ upload.single สำหรับอัปโหลดไฟล์เดียว
  upload.single('image')(req, res, function(error) {
    if (error) {
      // จัดการข้อผิดพลาดจาก multer
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)'
          });
        }
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด'
      });
    }
    
    // สร้าง URL สำหรับเข้าถึงไฟล์
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/${req.file.path.replace(/\\/g, '/')}`;
    
    res.status(201).json({
      success: true,
      message: 'อัปโหลดไฟล์สำเร็จ',
      file: {
        filename: req.file.filename,
        path: req.file.path,
        url: fileUrl
      }
    });
  });
};

// @desc    อัปโหลดหลายไฟล์
// @route   POST /api/upload/multiple
// @access  Private/Admin
const uploadMultipleFiles = (req, res) => {
  // ใช้ upload.array สำหรับอัปโหลดหลายไฟล์ (สูงสุด 10 ไฟล์)
  upload.array('images', 10)(req, res, function(error) {
    if (error) {
      // จัดการข้อผิดพลาดจาก multer
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
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
          message: error.message
        });
      }
      
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด'
      });
    }
    
    // สร้าง URL สำหรับเข้าถึงไฟล์
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const files = req.files.map(file => {
      const fileUrl = `${baseUrl}/${file.path.replace(/\\/g, '/')}`;
      
      return {
        filename: file.filename,
        path: file.path,
        url: fileUrl
      };
    });
    
    res.status(201).json({
      success: true,
      message: 'อัปโหลดไฟล์สำเร็จ',
      files
    });
  });
};

module.exports = {
  uploadFile,
  uploadMultipleFiles
};