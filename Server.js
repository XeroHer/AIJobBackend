// server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const connectDB = require("./db"); // MongoDB connection
const registerRoutes = require("./routes/register");
const loginRoutes = require("./routes/login");
const jobsRoutes = require("./routes/job");
const authRoutes = require("./routes/social");

// ---------- Connect to MongoDB ----------
connectDB();

// ---------- Initialize Express ----------
const app = express();

// ---------- CORS Setup ----------
const allowedOrigins = [
  "http://localhost:5172",
  "http://localhost:5173",
  "http://localhost:3000",
  
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman, mobile apps

      if (allowedOrigins.includes(origin)) return callback(null, true);

      console.warn("Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ---------- Middleware ----------
app.use(express.json());

// ---------- API Routes ----------
app.use("/api/jobs", jobsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth", registerRoutes);
app.use("/api/auth", loginRoutes);

// ---------- Static Uploads ----------
app.use("/uploads", express.static("uploads"));

// ---------- Test Route ----------
app.get("/", (req, res) => res.send("API is running..."));



// ---------- Global Error Handler ----------
app.use((err, req, res, next) => {
  console.error("Global error:", err.message);

  if (err.message.includes("CORS")) {
    return res.status(403).json({ message: err.message });
  }

  res.status(500).json({ message: "Internal server error" });
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));