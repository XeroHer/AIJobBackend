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
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  family: 4, // ✅ FIX IPv6 ISSUE
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// optional check
transporter.verify((err) => {
  if (err) console.error("SMTP ERROR:", err);
  else console.log("✅ SMTP Ready");
});

/* ================== HELPERS ================== */
const normalizeEmail = (email) => {
  if (!email || typeof email !== "string") return null;
  return email.toLowerCase().trim();
};

/* ================== RATE LIMITERS ================== */
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many registration attempts. Try later.",
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many OTP requests. Try later.",
});

/* ================== PASSWORD RULE ================== */
const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

/* ================== OTP SEND ================== */
const sendPasswordResetOTP = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Invalid email");

  const user = await User.findOne({ email: normalizedEmail });
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
      text: `Hello ${user.name},\n\nYour OTP is: ${otp}\nExpires in 10 minutes.`,
    });
  } catch (err) {
    console.error("❌ EMAIL ERROR:", err.message);
    if (process.env.NODE_ENV !== "production") {
      console.log(`OTP for ${user.email}: ${otp}`);
    }
  }

  return { message: "OTP sent" };
};

/* ================== REGISTER ================== */
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({ message: "Weak password" });
    }

    const strength = zxcvbn(password);
    if (strength.score < 3) {
      return res.status(400).json({ message: "Password too weak" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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
        subject: "Verify OTP",
        text: `Hello ${user.name},\n\nYour OTP: ${otp}`,
      });
    } catch (err) {
      console.error("❌ EMAIL ERROR:", err.message);
      if (process.env.NODE_ENV !== "production") {
        console.log(`OTP for ${user.email}: ${otp}`);
      }
    }

    res.status(201).json({ message: "Account created", email: user.email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================== VERIFY OTP ================== */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({
      email: normalizeEmail(email),
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.verified) {
      return res.status(400).json({ message: "Already verified" });
    }

    if (String(user.otp) !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    user.verified = true;
    user.otp = null;
    user.otpExpires = null;

    await user.save();

    res.json({ message: "Verified successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ================== PASSWORD RESET ================== */

// send OTP
router.post("/password-reset/send-otp", otpLimiter, async (req, res) => {
  try {
    const result = await sendPasswordResetOTP(req.body.email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// verify OTP
router.post("/password-reset/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({
      email: normalizeEmail(email),
    });

    if (
      !user ||
      String(user.resetPasswordOtp) !== String(otp) ||
      user.resetPasswordExpires < new Date()
    ) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    res.json({ message: "OTP verified" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// reset password
router.post("/password-reset/reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({
      email: normalizeEmail(email),
    });

    if (
      !user ||
      String(user.resetPasswordOtp) !== String(otp) ||
      user.resetPasswordExpires < new Date()
    ) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ validate password again
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ message: "Weak password" });
    }

    const strength = zxcvbn(newPassword);
    if (strength.score < 3) {
      return res.status(400).json({ message: "Password too weak" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordOtp = null;
    user.resetPasswordExpires = null;

    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;