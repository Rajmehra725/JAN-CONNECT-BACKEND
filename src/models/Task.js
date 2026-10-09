const mongoose = require("mongoose");

const TASK_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "कार्य शीर्षक आवश्यक है"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: [true, "कार्य विवरण आवश्यक है"],
      trim: true,
      maxlength: 3000,
    },
    assignedWorkerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "कार्यकर्ता पहचान आवश्यक है"],
      index: true,
    },
    createdById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    constituencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Constituency",
      index: true,
    },
    wardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ward",
      index: true,
    },
    boothId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booth",
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: "MEDIUM",
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "PENDING",
      index: true,
    },
    completionNotes: {
      type: String,
      trim: true,
    },
    completionMedia: [
      {
        assetId: String,
        url: String,
        resourceType: String,
      },
    ],
  },
  { timestamps: true }
);

taskSchema.index({ assignedWorkerId: 1, status: 1 });

module.exports = mongoose.model("Task", taskSchema);
module.exports.TASK_STATUSES = TASK_STATUSES;
module.exports.TASK_PRIORITIES = TASK_PRIORITIES;
