const Job = require("../models/Job");
const Application = require("../models/Applications");
const User = require("../models/User");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const cloudinary = require("../config/cloudinary").default;
const streamifier = require("streamifier");

// ------------------- CREATE JOB -------------------
const createJob = async (req, res) => {
  try {
    const {
      title,
      company,
      summary,
      description,
      workMode,
      employmentType,
      experience,
      location,
      salaryMin,
      salaryMax,
      skills,
    } = req.body;

    if (
      !title ||
      !company ||
      !summary ||
      !description ||
      !workMode ||
      !employmentType ||
      !experience
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const job = new Job({
      title,
      company,
      summary,
      description,
      workMode,
      employmentType,
      experience,
      location,
      salaryMin,
      salaryMax,
      skills,
      recruiterId: req.user._id, // 🔑 ownership
    });

    await job.save();
    res.status(201).json(job);
  } catch (error) {
    
    res.status(500).json({ message: error.message });
  }
};

// ------------------- GET ALL JOBS (PUBLIC) -------------------
const getJobs = async (req, res) => {
  try {
    const { title, location, skills, page = 1, limit = 10 } = req.query;

    const query = {};
    if (title) query.title = { $regex: title.trim(), $options: "i" };
    if (location) query.location = { $regex: location.trim(), $options: "i" };
    if (skills) query.skills = { $all: skills.split(",").map((s) => s.trim()) };

    const skip = (page - 1) * limit;

    const jobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Job.countDocuments(query);

    res.status(200).json({
      total,
      page: parseInt(page),
      jobs,
    });
  } catch (error) {
    
    res.status(500).json({ message: error.message });
  }
};

// ------------------- GET JOB BY ID (PUBLIC) -------------------
const getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    res.status(200).json(job);
  } catch (error) {
    
    res.status(500).json({ message: error.message });
  }
};

// ------------------- GET RECRUITER JOBS -------------------
const getRecruiterJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ recruiterId: req.user._id }).sort({
      createdAt: -1,
    });

    res.status(200).json(jobs);
  } catch (error) {
    
    res.status(500).json({ message: error.message });
  }
};

// ------------------- GET RECRUITER JOB COUNT -------------------
const getRecruiterJobCount = async (req, res) => {
  try {
    const count = await Job.countDocuments({
      recruiterId: req.user._id,
    });

    res.status(200).json({ count });
  } catch (error) {
    
    res.status(500).json({ message: error.message });
  }
};

// ------------------- UPDATE JOB -------------------
const updateJob = async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      recruiterId: req.user._id, // 🔒 ownership check
    });

    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    Object.assign(job, req.body);
    await job.save();

    res.status(200).json(job);
  } catch (error) {
    
    res.status(500).json({ message: error.message });
  }
};

// ------------------- DELETE JOB -------------------
const deleteJob = async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      recruiterId: req.user._id, // 🔒 ownership check
    });

    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    await Application.deleteMany({ jobId: job._id });
    await job.deleteOne();

    res.status(200).json({ message: "Job deleted successfully" });
  } catch (error) {
  
    res.status(500).json({ message: error.message });
  }
};

// ------------------- APPLY FOR JOB -------------------
const applyJob = async (req, res) => {
  try {
    const { name, email, message } = req.body;
    const resume = req.file;
    const jobId = req.params.id;

    if (!name || !email || !resume) {
      return res
        .status(400)
        .json({ message: "Name, email, and resume are required" });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // ----------------- Upload Resume to Cloudinary -----------------
    const uploadFromBuffer = () =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw", // needed for pdf/doc files
            folder: "resumes",
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        );

        streamifier.createReadStream(resume.buffer).pipe(stream);
      });

    const result = await uploadFromBuffer(); // ⭐ NOW result exists

    // ----------------- Save Application -----------------
    const application = new Application({
      jobId,
      name,
      email,
      message: message || "",
      resumePath: result.secure_url, // ⭐ Cloudinary URL
      resumeOriginalName: resume.originalname,
      status: "pending",
      userId: req.user?._id, // 👈 store user id
    });

    await application.save();

    // ----------------- Send Email to Recruiter -----------------
    const recruiter = await User.findById(job.recruiterId);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Job Application" <${process.env.SMTP_USER}>`,
      to: recruiter.email,
      subject: `New Application – ${job.title}`,
      html: `
        <h2>New Job Application</h2>
        <p><strong>Position:</strong> ${job.title}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
        <p><strong>Resume:</strong> <a href="${result.secure_url}">View Resume</a></p>
      `,
    });

    res.status(201).json({
      message: "Application submitted successfully",
    });
  } catch (error) {
    
    res.status(500).json({ message: error.message });
  }
};

// ------------------- GET JOB APPLICANTS -------------------
const getAllApplicantsForRecruiter = async (req, res) => {
  try {
    const recruiterId = req.user._id;

    // 1️⃣ Find all jobs posted by this recruiter
    const jobs = await Job.find({ recruiterId }).select("_id");
    const jobIds = jobs.map((job) => job._id);

    if (jobIds.length === 0) {
      return res.status(200).json([]); // no jobs => no applicants
    }

    // 2️⃣ Fetch all applications for these jobs
    const applicants = await Application.find({ jobId: { $in: jobIds } })
      .populate("jobId", "title")
      .sort({ createdAt: -1 });

    res.status(200).json(applicants);
  } catch (error) {
    
    res.status(500).json({ message: "Server error" });
  }
};

// controllers/jobController.js
const getRecruiterApplicantsCount = async (req, res) => {
  try {
    const recruiterId = req.user._id;

    const jobs = await Job.find({ recruiterId }).select("_id");
    const jobIds = jobs.map((job) => job._id);

    const count = await Application.countDocuments({ jobId: { $in: jobIds } });

    res.status(200).json({ count });
  } catch (err) {
    
    res.status(500).json({ message: "Server error" });
  }
};

// ------------------- UPDATE APPLICANT STATUS -------------------
const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status } = req.body;

    if (!["shortlist", "reject"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ message: "Invalid application ID" });
    }

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Ensure recruiter owns the job
    const job = await Job.findOne({
      _id: application.jobId,
      recruiterId: req.user._id,
    });

    if (!job) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    application.status = status;
    await application.save();

    res.status(200).json(application);
  } catch (error) {
    
    res.status(500).json({ message: "Server error" });
  }
};

const getMyApplications = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const applications = await Application.find({ userId: req.user._id })
      .populate("jobId", "title company")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(applications);
  } catch (err) {
    
    return res.status(500).json({ message: "Server error" });
  }
};

const getMyApplicationCount = async (req, res) => {
  try {
    // Check if user exists (from auth middleware)
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Count applications for this user
    const count = await Application.countDocuments({
      userId: req.user._id,
    });

    return res.status(200).json({ count });
  } catch (err) {
    
    return res.status(500).json({ message: "Server error" });
  }
};
// ------------------- GET PROFILE -------------------
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (err) {
    
    res.status(500).json({ message: "Server error" });
  }
};

const EditForm=async(req, res)=>{
   try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.json(job);
  } catch (err) {
    
    res.status(500).json({ message: "Server error" });
  }
}

const Statistics=async(req, res)=>{
   try {
    const jobsCount = await Job.countDocuments();
    const jobSeekersCount = await User.countDocuments({ role: "jobseeker" });
    const recruitersCount = await User.countDocuments({ role: "recruiter" });

    res.json({
      jobsCount,
      jobSeekersCount,
      recruitersCount,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ message: "Server error" });
  }
};
 const Contact = async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Configure Nodemailer transport
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // App password if Gmail 2FA is on
    },
  });

  const mailOptions = {
    from: `"${name}" <${process.env.SMTP_USER}>`, // safer from address
    replyTo: email, // so you can reply directly to the sender
    to: "bksraut27@gmail.com", // ✅ your email
    subject: `New Contact Message from ${name}`,
    html: `
      <h2>New Contact Message</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Message sent successfully" });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
};

module.exports = {
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
};
