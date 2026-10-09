const mongoose = require("mongoose");

const wardSchema = new mongoose.Schema(
  {
    wardNumber: {
      type: String,
      required: [true, "वार्ड क्रमांक आवश्यक है"],
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Compound index to ensure uniqueness of ward within a constituency
wardSchema.index({ constituencyId: 1, wardNumber: 1 }, { unique: true });

module.exports = mongoose.model("Ward", wardSchema);
