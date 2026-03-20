// models/RecommendedJob.js
const mongoose = require("mongoose");

const recommendedJobSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true, // One document per user
  },
   jobs: [
    {
      job: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
      atsScore: Number,
      matchedSkills: [String],
      missingSkills: [String],
    }
  ],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("RecommendedJob", recommendedJobSchema);