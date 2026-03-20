const express = require("express");
const router = express.Router();
const multer = require("multer");

const authRecruiter = require("../middleware/authRecruiter");
const authUser = require("../middleware/jobseekerMiddleware");
const auth =require("../middleware/Ayth")



const {
  createJob,
  getJobs,
  getJobById,
  getRecruiterJobs,
  getRecruiterJobCount,
  updateJob,
  deleteJob,
  applyJob,
  getAllApplicantsForRecruiter,
  updateApplicationStatus,
  getRecruiterApplicantsCount,
  getMyApplications,
  getMyApplicationCount,
  getProfile,
  EditForm,
  Statistics,
 Contact,
 
} = require("../controllers/jobController");

const { analyzeATS ,getRecommendedJobs} = require("../controllers/AIController");

// Memory-only storage for resume uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// =================== PUBLIC ROUTES ===================

router.get("/", getJobs);
router.get("/jobs/:id", getJobById);
router.post("/jobs/:id/apply", authUser, upload.single("resume"), applyJob);

// =================== RECRUITER ROUTES ===================
router.get("/applications/count", authUser, getMyApplicationCount );
router.get("/profile", authUser, getProfile)


router.get("/recruiter", authRecruiter, getRecruiterJobs);
router.get("/recruiter/count", authRecruiter, getRecruiterJobCount);
router.post("/", authRecruiter, createJob);
router.put("/:id", authRecruiter, updateJob);
router.delete("/:id", authRecruiter, deleteJob);

router.get("/recruiter/applicants", authRecruiter, getAllApplicantsForRecruiter);
router.get("/recruiter/applicants/count", authRecruiter, getRecruiterApplicantsCount);
router.patch("/applications/:applicationId/status", authRecruiter, updateApplicationStatus);

router.get("/applications", authUser, getMyApplications);

router.post("/ats/analyze", auth, upload.single("resume"), analyzeATS);
router.get("/user/recommended-jobs", authUser, getRecommendedJobs);
router.get("/statics", Statistics);
router.get("/:id", authRecruiter, EditForm);
router.post("/contact",Contact);



module.exports = router;