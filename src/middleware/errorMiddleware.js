const { MESSAGES } = require('../config/constants');

// จัดการกับ 404 (ไม่พบ route)
const notFound = (req, res, next) => {
  const error = new Error(`ไม่พบ - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// จัดการกับข้อผิดพลาดทั่วไป
const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || (res.statusCode === 200 ? 500 : res.statusCode);
  const production = process.env.NODE_ENV === 'production';
  
  res.status(statusCode).json({
    success: false,
    message: production && statusCode >= 500 ? MESSAGES.SERVER_ERROR : err.message || MESSAGES.SERVER_ERROR,
    stack: production ? null : err.stack
  });
};

module.exports = { notFound, errorHandler };
