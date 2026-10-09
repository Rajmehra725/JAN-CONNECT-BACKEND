const crypto = require("crypto");

function generateComplaintTrackingId() {
  const year = new Date().getFullYear();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `JC-${year}-${randomPart}`;
}

module.exports = {
  generateComplaintTrackingId,
};
