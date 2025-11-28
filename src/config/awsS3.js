const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

// สร้าง S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// กำหนดชื่อ bucket
const bucketName = process.env.AWS_S3_BUCKET_NAME || 'grandma-jazz-uploads';

// ฟังก์ชันสำหรับตรวจสอบประเภทไฟล์
const fileFilter = (req, file, cb) => {
  // กำหนดประเภทไฟล์ที่อนุญาต
  const allowedMimeTypes = {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    video: ['video/mp4', 'video/webm', 'video/mpeg'],
    audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm'],
  };

  // ตรวจสอบประเภทไฟล์ตาม fieldname หรือ path
  let isAllowed = false;
  
  // ตรวจสอบว่าเป็นไฟล์รูปภาพ
  if (allowedMimeTypes.image.includes(file.mimetype)) {
    isAllowed = true;
  }
  // ตรวจสอบว่าเป็นไฟล์วิดีโอ
  else if (file.fieldname === 'video' && allowedMimeTypes.video.includes(file.mimetype)) {
    isAllowed = true;
  }
  // ตรวจสอบว่าเป็นไฟล์เสียง (รองรับทั้ง 'audio', 'file', และ 'music')
  else if ((file.fieldname === 'audio' || file.fieldname === 'file' || file.fieldname === 'music') && allowedMimeTypes.audio.includes(file.mimetype)) {
    isAllowed = true;
  }

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`ไม่รองรับไฟล์ประเภท ${file.mimetype}`), false);
  }
};

// ฟังก์ชันสำหรับกำหนด key (path) ใน S3
const generateS3Key = (req, file, folderName) => {
  const timestamp = Date.now();
  const originalName = file.originalname.replace(/\s+/g, '-');
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  
  return `${folderName}/${name}-${timestamp}${ext}`;
};

// สร้าง multer upload สำหรับ S3
const createS3Upload = (folderName, limits = {}) => {
  return multer({
    storage: multerS3({
      s3: s3Client,
      bucket: bucketName,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: function (req, file, cb) {
        cb(null, {
          fieldName: file.fieldname,
          uploadedBy: req.user ? req.user._id.toString() : 'anonymous',
        });
      },
      key: function (req, file, cb) {
        const s3Key = generateS3Key(req, file, folderName);
        cb(null, s3Key);
      },
    }),
    fileFilter: fileFilter,
    limits: {
      fileSize: limits.fileSize || 50 * 1024 * 1024, // default 50MB
      ...limits,
    },
  });
};

// Export uploads สำหรับแต่ละประเภท
const uploaders = {
  // Upload สำหรับรูปภาพทั่วไป
  imageUpload: createS3Upload('images', { fileSize: 5 * 1024 * 1024 }), // 5MB
  
  // Upload สำหรับวิดีโอ
  videoUpload: createS3Upload('videos', { fileSize: 100 * 1024 * 1024 }), // 100MB
  
  // Upload สำหรับเพลง
  musicUpload: createS3Upload('music', { fileSize: 20 * 1024 * 1024 }), // 20MB
  
  // Upload สำหรับการ์ด
  cardUpload: createS3Upload('cards', { fileSize: 5 * 1024 * 1024 }), // 5MB
  
  // Upload สำหรับบล็อก
  blogUpload: createS3Upload('blogs', { fileSize: 5 * 1024 * 1024 }), // 5MB
};

// ฟังก์ชันสำหรับสร้าง URL ของไฟล์ใน S3
const getS3FileUrl = (key) => {
  const region = process.env.AWS_REGION || 'ap-southeast-2';
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
};

module.exports = {
  s3Client,
  bucketName,
  uploaders,
  getS3FileUrl,
  createS3Upload,
}; 