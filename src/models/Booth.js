const mongoose = require("mongoose");

const boothSchema = new mongoose.Schema(
  {
    boothNumber: {
      type: String,
      required: [true, "बूथ क्रमांक आवश्यक है"],
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    constituencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Constituency",
      required: [true, "संबंधित विधानसभा आईडी आवश्यक है"],
      index: true,
    },
    wardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ward",
      index: true,
    },
    location: {
      type: String,
      trim: true,
    },
    assignedWorkerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Compound index: unique booth per constituency
boothSchema.index({ constituencyId: 1, boothNumber: 1 }, { unique: true });

module.exports = mongoose.model("Booth", boothSchema);
