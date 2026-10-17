const mongoose = require("mongoose");

const ROLES = ["SUPER_ADMIN", "POLITICIAN", "PA_STAFF", "BOOTH_WORKER", "CITIZEN"];
const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "DEACTIVATED"];

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "पूरा नाम आवश्यक है"],
      trim: true,
      maxlength: 120,
    },
    mobileNumber: {
      type: String,
      required: [true, "मोबाइल नंबर आवश्यक है"],
      unique: true,
      trim: true,
      match: [/^\d{10}$/, "कृपया 10 अंकों का वैध मोबाइल नंबर दर्ज करें"],
      index: true,
    },
    alternateMobile: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, "पासवर्ड आवश्यक है"],
      select: false, // Never return by default
    },
    role: {
      type: String,
      enum: ROLES,
      default: "CITIZEN",
      index: true,
    },
    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER"],
    },
    occupation: {
      type: String,
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    voterId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    preferredLanguage: {
      type: String,
      default: "HINDI",
    },
    // Geographic and Administrative Hierarchy References
    constituencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Constituency",
      index: true,
      default: null,
    },
    wardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ward",
      index: true,
      default: null,
    },
    boothId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booth",
      index: true,
      default: null,
    },
    officeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      index: true,
      default: null,
    },
    // Address Details
    address: {
      type: String,
      trim: true,
    },
    villageMohalla: {
      type: String,
      trim: true,
    },
    wardNumber: {
      type: String,
      trim: true,
    },
    boothNumber: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    assemblyConstituency: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    gpsLocation: {
      type: String,
      trim: true,
    },
    familyId: {
      type: String,
      trim: true,
    },
    emergencyContact: {
      type: String,
      trim: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Automatic phone number normalization before schema validation
const { normalizePhoneNumber } = require('../utils/phone');

userSchema.pre('validate', function () {
  if (this.mobileNumber) {
    const { isValid, normalized } = normalizePhoneNumber(this.mobileNumber);
    if (isValid) {
      this.mobileNumber = normalized;
    }
  }
  if (this.alternateMobile) {
    const { isValid, normalized } = normalizePhoneNumber(this.alternateMobile);
    if (isValid) {
      this.alternateMobile = normalized;
    }
  }
});

// Safe JSON serialization to ensure passwordHash is never returned
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
