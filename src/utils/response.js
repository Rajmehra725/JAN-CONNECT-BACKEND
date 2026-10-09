/**
 * Standardized API Response Utilities
 */

function successResponse(res, data = null, message = "Request successful", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function errorResponse(res, message = "Request could not be completed", code = "REQUEST_FAILED", statusCode = 400, errors = null) {
  // If code is passed as numeric status code, e.g. errorResponse(res, msg, 404)
  if (typeof code === 'number') {
    statusCode = code;
    code = statusCode === 404 ? 'NOT_FOUND' :
           statusCode === 401 ? 'UNAUTHORIZED' :
           statusCode === 403 ? 'FORBIDDEN' :
           statusCode === 429 ? 'RATE_LIMIT_EXCEEDED' :
           statusCode === 500 ? 'SERVER_ERROR' : 'REQUEST_FAILED';
  }

  const payload = {
    success: false,
    message,
    code,
  };
  if (errors) {
    payload.errors = errors;
  }
  return res.status(statusCode).json(payload);
}

module.exports = {
  successResponse,
  errorResponse,
};
