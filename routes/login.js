const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();



/* ========= LOGIN ========= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password required" });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // ❌ Prevent social-login-only accounts from local login
    if (user.provider !== "local") {
      return res.status(400).json({
        message: `Please login using ${user.provider}`,
      });
    }
   // 🚨 BLOCK unverified accounts
if (!user.verified) {
  return res.status(403).json({
    message: "Please verify your email before logging in",
  });
}
   

const isMatch = await bcrypt.compare(password, user.password);


    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // 🔐 JWT
    const token = jwt.sign(
      {
        _id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        picture: user.picture,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;