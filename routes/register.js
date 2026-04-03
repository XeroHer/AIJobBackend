const express = require("express");
const bcrypt = require("bcryptjs");
const { Resend } = require("resend");
const User = require("../models/User");

const validator = require("validator");
const rateLimit = require("express-rate-limit");
const zxcvbn = require("zxcvbn");

const router = express.Router();

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

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
    await resend.emails.send({
      from: "AI Job Portal <noreply@myjobportal.store>", // ✅ Use your verified domain
      to: user.email,
      subject: "Password Reset OTP",
      html: `
        <h2>Hello ${user.name}</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>This OTP expires in 10 minutes.</p>
      `,
    });
  } catch (err) {
    console.error("❌ EMAIL ERROR:", err.message);
    if (process.env.NODE_ENV !== "production") {
      console.log(`OTP for ${user.email}: ${otp}`);
    }
    throw new Error("Email failed to send");
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
      await resend.emails.send({
        from: "AI Job Portal <noreply@myjobportal.store>", // ✅ Match verified domain
        to: user.email,
        subject: "Verify your account",
        html: `
          <h2>Hello ${user.name}</h2>
          <p>Your OTP is:</p>
          <h1>${otp}</h1>
          <p>This OTP expires in 10 minutes.</p>
        `,
      });
    } catch (err) {
      console.error("❌ EMAIL ERROR:", err.message);
      if (process.env.NODE_ENV !== "production") {
        console.log(`OTP for ${user.email}: ${otp}`);
      }
      return res.status(500).json({ message: "Failed to send OTP email" });
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

    const user = await User.findOne({ email: normalizeEmail(email) });
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
router.post("/password-reset/send-otp", otpLimiter, async (req, res) => {
  try {
    const result = await sendPasswordResetOTP(req.body.email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/password-reset/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || String(user.resetPasswordOtp) !== String(otp) || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    res.json({ message: "OTP verified" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/password-reset/reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || String(user.resetPasswordOtp) !== String(otp) || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

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