const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "विभाग का नाम अनिवार्य है"],
      unique: true,
      trim: true,
      index: true
    },
    nameHi: {
      type: String,
      trim: true,
      default: ""
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", departmentSchema);
