 const mongoose = require("mongoose");


const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    name: String,
    email: String,
    message: String,
    resumePath: String,
    resumeOriginalName: String,
    status: {
      type: String,
      enum: ["pending", "shortlist", "reject"],
      default: "pending",
    },
    
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);
module.exports = mongoose.model("Application", applicationSchema);