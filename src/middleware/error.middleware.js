const { errorResponse } = require('../utils/response');

/**
 * 404 Route Not Found Handler
 */
function notFoundHandler(req, res, next) {
  return errorResponse(res, `Anurodh kiya gaya endpoint [${req.method} ${req.originalUrl}] uplabdh nahi hai.`, 404);
}

/**
 * Centralized Global Error Handler
 */
function errorHandler(err, req, res, next) {
  // Log server errors for maintenance/debugging
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled Server Error:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      url: req.originalUrl,
      method: req.method
    });
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return errorResponse(res, `Data validation truti: ${messages.join(', ')}`, 400);
  }

  // Handle Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {}).join(', ');
    return errorResponse(res, `Duplicate record truti: [${fields}] pehle se maujood hai.`, 409);
  }

  // Handle Mongoose Invalid ObjectId
  if (err.name === 'CastError') {
    return errorResponse(res, `Amanay resource ID pradan ki gayi: ${err.value}`, 400);
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 'File ka aakar nirdharit seema (5MB) se adhik hai.', 400);
    }
    return errorResponse(res, `File upload truti: ${err.message}`, 400);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Amanay authentication token pradan kiya gaya.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Aapka session samapt ho gaya hai. Kripya punah login karein.', 401);
  }

  // Default internal server error
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Aantarik server truti hui. Kripya thodi der baad prayas karein.'
    : (err.message || 'Server error occurred');

  return errorResponse(res, message, statusCode);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
