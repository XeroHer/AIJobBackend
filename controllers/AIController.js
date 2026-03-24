// controllers/AIController.js
const RecommendedJob = require("../models/recommendJobs");
const User = require("../models/User");
const Job = require("../models/Job");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const axios = require("axios");

// Multer middleware should be applied in the route, not here
exports.analyzeATS = async (req, res) => {
  try {
    const user = req.user;
    if (!user)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const userFromDB = await User.findById(user._id);
    if (!userFromDB)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const file = req.file;
    if (!file)
      return res
        .status(400)
        .json({ success: false, message: "Resume file is required" });

    console.log("User:", user);
    console.log("Uploaded file:", file.originalname);

    // --- Extract resume text ---
    let resumeText = "";
    const filename = file.originalname.toLowerCase();

    if (filename.endsWith(".pdf")) {
      const pdfData = await pdfParse(file.buffer);
      resumeText = pdfData.text?.trim();
    } else if (filename.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      resumeText = result.value.trim();
    } else if (file.mimetype.startsWith("image/")) {
      const { data: { text } } = await Tesseract.recognize(file.buffer, "eng");
      resumeText = text.trim();
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Unsupported file format" });
    }

    if (!resumeText || resumeText.length < 50)
      return res
        .status(400)
        .json({ success: false, message: "Resume text too short" });

    // --- Fetch all jobs ---
    const allJobs = await Job.find().select(
      "_id title company location description"
    );

    // --- Prepare user profile ---
    const userProfile = {
      skills: userFromDB.skills || [],
      experience: userFromDB.experience || "",
      preferences: userFromDB.preferences || {},
    };

    // --- Call AI Service ---
    let atsAnalysis;
    try {
      const aiResponse = await axios.post(
       "https://aijobbackend.onrender.com/ats/analyze",
        {
          resume: resumeText,
          userProfile,
          jobs: allJobs.map((job) => ({
            id: job._id.toString(),
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
          })),
        },
        { timeout: 30000 }
      );
      atsAnalysis = aiResponse.data;
      console.log(
        "AI analysis received:",
        atsAnalysis?.recommendedJobs?.length
      );
    } catch (aiError) {
      console.error(
        "AI Service Error:",
        aiError.response?.data || aiError.message
      );
      return res.status(500).json({
        success: false,
        message: "AI service failed",
        error: aiError.response?.data || aiError.message,
      });
    }

    // --- Map AI recommendations to DB jobs ---
    let recommendedJobs = [];
    if (atsAnalysis?.recommendedJobs?.length) {
      const recommendedIds = atsAnalysis.recommendedJobs.map((job) => job.id);
      const jobsFromDB = await Job.find({ _id: { $in: recommendedIds } });

      recommendedJobs = jobsFromDB.map((job) => {
        const match = atsAnalysis.recommendedJobs.find(
          (r) => r.id === job._id.toString()
        );
        return {
          ...job.toObject(),
          atsScore: match?.score || 0,
          matchedSkills: match?.matchedSkills || [],
          missingSkills: match?.missingSkills || [],
        };
      });

      recommendedJobs.sort((a, b) => b.atsScore - a.atsScore);
    }

    // --- Calculate average ATS score ---
    const avgAtsScore =
      recommendedJobs.length > 0
        ? recommendedJobs.reduce((sum, job) => sum + job.atsScore, 0) /
          recommendedJobs.length
        : 0;

    // --- Save recommendations per user ---
    await RecommendedJob.findOneAndUpdate(
      { user: user._id },
      {
        jobs: recommendedJobs.map((job) => ({
          job: job._id,
          atsScore: job.atsScore,
          matchedSkills: job.matchedSkills,
          missingSkills: job.missingSkills,
        })),
        avgAtsScore,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // ✅ Return response
    return res.status(200).json({
      success: true,
      atsAnalysis,
      recommendedJobs,
      avgAtsScore, // ✅ corrected
    });
  } catch (error) {
    console.error("ATS Analysis Error:", error);
    return res.status(500).json({
      success: false,
      message: "ATS analysis failed",
      error: error.message,
    });
  }
};

// --- Get stored recommended jobs ---
exports.getRecommendedJobs = async (req, res) => {
  try {
    const userId = req.user._id;
    const rec = await RecommendedJob.findOne({ user: userId }).populate(
      "jobs.job"
    );

   const jobs = rec?.jobs
  ?.filter(item => item.job) // ✅ remove null/undefined jobs
  .map((item) => {
    const jobObj = item.job.toObject ? item.job.toObject() : item.job;

    return {
      ...jobObj,
      id: jobObj._id, // ✅ important for frontend
      atsScore: item.atsScore,
      matchedSkills: item.matchedSkills,
      missingSkills: item.missingSkills,
    };
  }) || [];

    return res.status(200).json({
      success: true,
      recommendedJobs: jobs || [],
      avgAtsScore: rec?.avgAtsScore || 0, // ✅ include avgAtsScore here too
    });
  } catch (error) {
    console.error("Error fetching recommended jobs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recommended jobs",
      error: error.message,
    });
  }
};
