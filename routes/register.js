const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const validator = require("validator");
const rateLimit = require("express-rate-limit");
const zxcvbn = require("zxcvbn");
const router = express.Router();

/* ================== EMAIL TRANSPORT ================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* ================== HELPER FUNCTIONS ================== */

// Send password reset OTP
const sendPasswordResetOTP = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new Error("User not found");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

  user.resetPasswordOtp = otp;
  user.resetPasswordExpires = otpExpires;
  await user.save();

  try {
    await transporter.sendMail({
      from: `"AI Job Portal" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: "Password Reset OTP",
      text: `Hello ${user.name},\n\nYour password reset OTP is: ${otp}\nThis OTP will expire in 10 minutes.`,
    });
  } catch (err) {
    console.log(`SMTP failed, OTP for ${user.email}: ${otp}`);
    console.error("❌ EMAIL ERROR:", err);
  }

  return { message: "OTP sent (check email or console)" };
};

// Reset password

/* ================== REGISTER ================== */
// 🔒 Rate limiter (prevents abuse)
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 50, // limit each IP
  message: "Too many registration attempts. Try again later.",
});
//Strong password
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "All fields are required" });
    
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character",
      });
    }
    // ✅ Password strength (zxcvbn)
    const passwordCheck = zxcvbn(password);
    if (passwordCheck.score < 3) {
      return res.status(400).json({
        message: "Password is too weak. Try something more complex.",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate registration OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      provider: "local",
      otp,
      otpExpires,
      verified: false,
    });

    try {
      await transporter.sendMail({
        from: `"AI Job Portal" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Verify your account (OTP)",
        text: `Hello ${user.name},\n\nYour OTP is: ${otp}\nThis OTP will expire in 10 minutes.`,
      });
    } catch (err) {
      console.log(`SMTP failed, OTP for ${user.email}: ${otp}`);
      console.error("❌ EMAIL ERROR:", err);
    }

    res
      .status(201)
      .json({
        message: "Account created! Check your email to verify your account.",
        email: user.email,
      });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ================== VERIFY REGISTRATION OTP ================== */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP are required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.verified)
      return res.status(400).json({ message: "Account already verified" });
    if (user.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });
    if (!user.otpExpires || user.otpExpires < new Date())
      return res.status(400).json({ message: "OTP has expired" });

    user.verified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res
      .status(200)
      .json({ message: "OTP verified successfully! You can now log in." });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ================== PASSWORD RESET ROUTES ================== */
// Send password reset OTP
router.post("/password-reset/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const result = await sendPasswordResetOTP(email);
    res.status(200).json(result);
  } catch (err) {
    console.error("Password reset OTP error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

// Verify password reset OTP
router.post("/password-reset/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (
      !user.resetPasswordOtp ||
      user.resetPasswordOtp !== otp ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < new Date()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    res.status(200).json({ message: "OTP verified" });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

// Reset password
router.post("/password-reset/reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "All fields are required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (
      !user.resetPasswordOtp ||
      user.resetPasswordOtp !== otp ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < new Date()
    )
      return res.status(400).json({ message: "Invalid or expired OTP" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordOtp = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(400).json({ message: err.message || "Server error" });
  }
});

module.exports = router;
