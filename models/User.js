const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");


const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
  type: String,
  required: true,
  unique: true,
  lowercase: true,
  trim: true,
},
  password: {
    type: String,
    required: function () {
      return this.provider === "local";
    },
  },
  role: {
    type: String,
    enum: ["jobseeker", "recruiter"],
    required: true,
  },
  provider: {
    type: String,
    default: "local",
  },
  picture: String,

  // Registration OTP
  otp: String,
  otpExpires: Date,
  verified: {
    type: Boolean,
    default: false,
  },

  // Password reset OTP
  resetPasswordOtp: String,
  resetPasswordExpires: Date,

  createdAt: {
    type: Date,
    default: Date.now,
  },


});

// 🔐 Hash password before save if changed
userSchema.pre("save", async function () {
  
});

module.exports = mongoose.model("User", userSchema);