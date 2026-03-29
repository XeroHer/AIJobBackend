const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit"); // optional
require("dotenv").config();

const registerRoutes = require("./routes/register");
const loginRoutes = require("./routes/login");
const jobs = require("./routes/job");
const authRoutes = require("./routes/social");

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is missing in .env");
}

// ---------- MongoDB Connection ----------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(console.error);

const app = express();

// ---------- TRUST PROXY FIX ----------
app.set("trust proxy", 1); // Fixes X-Forwarded-For error behind proxy

// ---------- RATE LIMITER (optional) ----------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
app.use(limiter);

// ---------- CORS Setup ----------
const allowedOrigins = [
  "http://localhost:5172",
  "http://localhost:5173",
  "http://localhost:5174",
  "https://localhost:5173",
  "https://localhost:5174",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "https://aijobportals.netlify.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      console.log("Request origin:", origin);
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (origin.startsWith("http://localhost")) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

// ---------- API Routes ----------
app.use("/api/jobs", jobs);
app.use("/api/auth", authRoutes);
app.use("/api/auth", registerRoutes);
app.use("/api/auth", loginRoutes);

// ---------- Static Uploads ----------
app.use("/uploads", express.static("uploads"));

// ---------- Test Route ----------
app.get("/", (req, res) => {
  res.send("API is running...");
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});