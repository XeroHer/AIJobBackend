// models/Job.js
const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 400,
    },
    location: {
      type: String,
      trim: true,
      default: "Remote",
    },
    workMode: {
      type: String,
      enum: ["remote", "hybrid", "onsite"],
      required: true,
    },
    employmentType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "internship"],
      required: true,
    },
    salaryMin: {
      type: Number,
      min: 0,
    },
    salaryMax: {
      type: Number,
      min: 0,
      validate: {
        validator: function (value) {
          return !this.salaryMin || value >= this.salaryMin;
        },
        message: "Max salary must be greater than min salary",
      },
    },
    description: {
      type: String,
      required: true,
    },
    skills: {
      type: [String],
      default: [],
    },
    experience: {
      type: String,
      enum: ["entry", "mid", "senior"],
      required: true,
    },

    // 🔑 THIS IS THE KEY
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // or "Recruiter"
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Job", jobSchema);
