const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

/**
 * ลบไฟล์จาก GridFS
 * @param {string} filename ชื่อไฟล์ที่ต้องการลบ
 * @param {string} bucketName ชื่อ bucket ที่เก็บไฟล์
 * @returns {Promise<Object>} ผลลัพธ์การลบไฟล์
 */
const deleteFile = async (filename, bucketName) => {
  try {
    if (!filename || !bucketName) {
      return { success: false, message: 'Filename and bucketName are required' };
    }
    
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: bucketName
    });
    
    // ค้นหาไฟล์
    const file = await mongoose.connection.db.collection(`${bucketName}.files`).findOne({ filename });
    
    if (!file) {
      return { success: false, message: 'File not found' };
    }
    
    // ลบไฟล์
    await bucket.delete(file._id);
    
    return { success: true, message: 'File deleted successfully' };
  } catch (error) {
    console.error('Error deleting file from GridFS:', error);
    return { success: false, message: 'Error deleting file', error };
  }
};

module.exports = { deleteFile };