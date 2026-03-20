const jwt = require("jsonwebtoken");

const authRecruiter = (req, res, next) => {
const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  // const token = authHeader.split(" ")[1];
  const token = req.header("Authorization")?.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // ✅ Allow only recruiters
    if (decoded.role !== "recruiter") {
      return res.status(403).json({ message: "Recruiter access only" });
    }

    req.user = {
      _id: decoded._id, // ✅ FIXED
      role: decoded.role,
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authRecruiter;
