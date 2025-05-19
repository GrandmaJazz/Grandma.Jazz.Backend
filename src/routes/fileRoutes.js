const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

// @route   GET /api/files/:bucketName/:filename
// @desc    ดึงไฟล์จาก GridFS
// @access  Public
router.get('/:bucketName/:filename', async (req, res) => {
  try {
    const { bucketName, filename } = req.params;
    
    // สร้าง bucket ตามที่ต้องการ
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: bucketName
    });
    
    // ค้นหาไฟล์
    const files = await mongoose.connection.db.collection(`${bucketName}.files`).findOne({ filename });
    
    if (!files) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // ตั้งค่า content-type
    res.set('Content-Type', files.metadata.mimeType);
    
    // สร้าง stream เพื่อส่งไฟล์
    const downloadStream = bucket.openDownloadStreamByName(filename);
    
    // ส่งข้อมูลไฟล์ไปยัง response
    downloadStream.pipe(res);
    
    // จัดการข้อผิดพลาด
    downloadStream.on('error', () => {
      return res.status(404).json({
        success: false,
        message: 'Error streaming file'
      });
    });
    
  } catch (error) {
    console.error('File fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/files/:bucketName/:filename
// @desc    ลบไฟล์จาก GridFS
// @access  Private/Admin
router.delete('/:bucketName/:filename', async (req, res) => {
  try {
    const { bucketName, filename } = req.params;
    
    // สร้าง bucket ตามที่ต้องการ
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: bucketName
    });
    
    // ค้นหาไฟล์
    const file = await mongoose.connection.db.collection(`${bucketName}.files`).findOne({ filename });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // ลบไฟล์
    await bucket.delete(file._id);
    
    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
    
  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;