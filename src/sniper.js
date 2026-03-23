// src/sniper.js

const axios = require("axios");

// ===== CONFIG =====
const CONFIG = {
    maxServersPerPage: 100,
    batchSize: 100,
    requestDelay: 350, // ms between requests (safe)
    maxRetries: 3,
    concurrentPageRequests: 2
};

// ===== UTIL =====
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// ===== ROBLOX API WRAPPERS =====
async function fetchServers(placeId, cursor = null) {
    const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100${cursor ? `&cursor=${cursor}` : ""}`;

    const res = await axios.get(url);
    return res.data;
}

async function fetchAvatar(userId) {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`;

    const res = await axios.get(url);
    return res.data.data[0]?.imageUrl;
}

async function fetchThumbnails(tokens) {
    const body = tokens.map(token => ({
        requestId: `0:${token}:AvatarHeadshot:150x150:png:regular`,
        type: "AvatarHeadShot",
        targetId: 0,
        token: token,
        format: "png",
        size: "150x150"
    }));

    const res = await axios.post(
        "https://thumbnails.roblox.com/v1/batch",
        body,
        { headers: { "Content-Type": "application/json" } }
    );

    return res.data.data;
}

// ===== RETRY WRAPPER =====
async function safeRequest(fn, retries = CONFIG.maxRetries) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            await delay(500);
        }
    }
}

// ===== CORE MATCHING =====
async function processTokens(tokenEntries, targetImage) {
    for (let i = 0; i < tokenEntries.length; i += CONFIG.batchSize) {
        const batch = tokenEntries.slice(i, i + CONFIG.batchSize);

        const tokens = batch.map(entry => entry.token);

        const thumbnails = await safeRequest(() => fetchThumbnails(tokens));

        for (let j = 0; j < thumbnails.length; j++) {
            const thumb = thumbnails[j];

            if (!thumb || !thumb.imageUrl) continue;

            if (thumb.imageUrl === targetImage) {
                return batch[j]; // MATCH FOUND
            }
        }

        await delay(CONFIG.requestDelay);
    }

    return null;
}

// ===== MAIN FUNCTION =====
async function findPlayer(placeId, userId) {
    let cursor = null;
    let found = null;

    // Step 1: Get target avatar
    const targetImage = await safeRequest(() => fetchAvatar(userId));

    if (!targetImage) {
        return { success: false, error: "Avatar fetch failed" };
    }

    let pageCount = 0;

    do {
        const pageData = await safeRequest(() => fetchServers(placeId, cursor));

        if (!pageData || !pageData.data) break;

        cursor = pageData.nextPageCursor;
        pageCount++;

        let tokenEntries = [];

        // Collect tokens
        for (const server of pageData.data) {
            if (!server.playerTokens) continue;

            for (const token of server.playerTokens) {
                tokenEntries.push({
                    token: token,
                    jobId: server.id,
                    placeId: placeId
                });
            }
        }

        // Step 2: Match tokens
        const match = await processTokens(tokenEntries, targetImage);

        if (match) {
            // 🔁 Double-check (accuracy boost)
            const confirm = await processTokens([match], targetImage);

            if (confirm) {
                found = match;
                break;
            }
        }

        await delay(CONFIG.requestDelay);

    } while (cursor);

    if (found) {
        return {
            success: true,
            jobId: found.jobId,
            placeId: found.placeId
        };
    }

    return {
        success: false,
        error: "Player not found"
    };
}

module.exports = { findPlayer };
