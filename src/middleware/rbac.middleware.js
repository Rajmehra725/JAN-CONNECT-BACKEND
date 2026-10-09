const { errorResponse } = require("../utils/response");

/**
 * Role-Based Access Control Middleware
 * @param  {...string} allowedRoles - List of permitted roles
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, "प्रमाणीकरण आवश्यक है।", "AUTH_REQUIRED", 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        `इस क्रिया के लिए आवश्यक अनुमतियाँ नहीं हैं। (Role '${req.user.role}' lacks permission)`,
        "FORBIDDEN_ROLE",
        403
      );
    }

    next();
  };
}

module.exports = {
  requireRoles,
};
