// src/jobManager.js

const { findPlayer } = require("./sniper");

const jobs = new Map();

// Create a new job
function createJob(placeId, userId) {
    const jobId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    jobs.set(jobId, {
        status: "pending",
        result: null,
        createdAt: Date.now()
    });

    // Run in background
    runJob(jobId, placeId, userId);

    return jobId;
}

// Run the sniper logic
async function runJob(jobId, placeId, userId) {
    try {
        jobs.get(jobId).status = "running";

        const result = await findPlayer(placeId, userId);

        jobs.set(jobId, {
            status: "completed",
            result: result,
            createdAt: jobs.get(jobId).createdAt
        });

    } catch (err) {
        console.error("Job failed:", err);

        jobs.set(jobId, {
            status: "failed",
            result: { success: false, error: "Job failed" },
            createdAt: jobs.get(jobId).createdAt
        });
    }
}

// Get job status
function getJob(jobId) {
    return jobs.get(jobId) || null;
}

// Cleanup old jobs (important for memory)
setInterval(() => {
    const now = Date.now();

    for (const [jobId, job] of jobs.entries()) {
        if (now - job.createdAt > 5 * 60 * 1000) { // 5 minutes
            jobs.delete(jobId);
        }
    }
}, 60 * 1000);

module.exports = {
    createJob,
    getJob
};
