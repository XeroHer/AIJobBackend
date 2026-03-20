const mongoose = require("mongoose");
const jobSchema = new mongoose.Schema(
  {
    title: String,
    company: String,
    location: String,
    description: String,

    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // or Recruiter
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", jobSchema);