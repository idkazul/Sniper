// src/index.js

const express = require("express");
const { createJob, getJob } = require("./jobManager");

const app = express();
app.use(express.json());

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
    res.send("Sniper API is running");
});

// ===== START SNIPER JOB =====
app.get("/snipe", (req, res) => {
    const { placeId, userId } = req.query;

    if (!placeId || !userId) {
        return res.status(400).json({
            success: false,
            error: "Missing placeId or userId"
        });
    }

    console.log(`[NEW JOB] placeId=${placeId} userId=${userId}`);

    try {
        const jobId = createJob(placeId, userId);

        return res.json({
            success: true,
            jobId: jobId
        });

    } catch (err) {
        console.error("[ERROR CREATING JOB]", err);

        return res.status(500).json({
            success: false,
            error: "Failed to create job"
        });
    }
});

// ===== CHECK JOB STATUS =====
app.get("/status", (req, res) => {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({
            success: false,
            error: "Missing job ID"
        });
    }

    const job = getJob(id);

    if (!job) {
        return res.status(404).json({
            success: false,
            error: "Job not found"
        });
    }

    return res.json({
        success: true,
        status: job.status,   // pending | running | completed | failed
        result: job.result
    });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Sniper API running on port ${PORT}`);
});
