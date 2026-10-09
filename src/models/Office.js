const mongoose = require("mongoose");

const officeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "कार्यालय का नाम आवश्यक है"],
      trim: true,
    },
    politicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    constituencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Constituency",
      index: true,
    },
    address: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    staffIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Office", officeSchema);
