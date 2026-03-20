const express = require("express");
const router = express.Router();
const { googleLogin, facebookLogin } = require("../controllers/socialController");

// Google login
router.post("/google", googleLogin);

// Facebook login
router.post("/facebook", facebookLogin);

module.exports = router;
