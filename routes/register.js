const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const validator = require("validator");
const rateLimit = require("express-rate-limit");
const zxcvbn = require("zxcvbn");

const router = express.Router();

/* ================== EMAIL SETUP ================== */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Gmail App Password
  },
});

const sendEmail = async (to, subject, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"AI Job Portal" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    console.log("📧 Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ EMAIL ERROR:", err);
    throw new Error("Email failed");
  }
};

/* ================== HELPERS ================== */
const normalizeEmail = (email) => {
  if (!email || typeof email !== "string") return null;
  return email.toLowerCase().trim();
};

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ================== RATE LIMITERS ================== */
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
});

/* ================== PASSWORD RULE ================== */
const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

/* ================== OTP SEND ================== */
const sendPasswordResetOTP = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Invalid email");

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return { message: "If email exists, OTP sent" };

  const otp = generateOTP();
  const hashedOtp = await bcrypt.hash(otp, 10);

  user.resetPasswordOtp = hashedOtp;
  user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  await sendEmail(
    user.email,
    "Password Reset OTP",
    `<h2>Hello ${user.name}</h2>
     <h1>${otp}</h1>
     <p>Expires in 10 minutes</p>`
  );

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

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(400).json({ message: "Email already exists" });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({ message: "Weak password" });
    }

    if (zxcvbn(password).score < 3) {
      return res.status(400).json({ message: "Password too weak" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      provider: "local",
      otp: hashedOtp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
      verified: false,
    });

    await sendEmail(
      user.email,
      "Verify your account",
      `<h2>Hello ${user.name}</h2>
       <h1>${otp}</h1>
       <p>Expires in 10 minutes</p>`
    );

    res.status(201).json({ message: "Account created", email: user.email });
  } catch (err) {
    console.error(err);
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

    const isMatch = await bcrypt.compare(otp, user.otp);

    if (!isMatch) {
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
      !(await bcrypt.compare(otp, user.resetPasswordOtp)) ||
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
      !(await bcrypt.compare(otp, user.resetPasswordOtp)) ||
      user.resetPasswordExpires < new Date()
    ) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ message: "Weak password" });
    }

    if (zxcvbn(newPassword).score < 3) {
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