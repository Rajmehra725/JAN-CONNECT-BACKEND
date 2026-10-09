const mongoose = require("mongoose");

const constituencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "विधानसभा क्षेत्र का नाम आवश्यक है"],
      trim: true,
      index: true,
    },
    code: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    district: {
      type: String,
      required: [true, "जिले का नाम आवश्यक है"],
      trim: true,
      index: true,
    },
    state: {
      type: String,
      default: "Madhya Pradesh",
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Constituency", constituencySchema);
