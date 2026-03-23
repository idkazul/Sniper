// src/sniper.js

const axios = require("axios");

// ===== CONFIG =====
const CONFIG = {
    batchSize: 100,
    requestDelay: 350,
    maxRetries: 3
};

// ===== UTIL =====
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Extract unique CDN hash
function extractHash(url) {
    if (!url) return null;
    const match = url.match(/rbxcdn\.com\/([^/]+)/);
    return match ? match[1] : null;
}

// ===== API =====
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

// ===== RETRY =====
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

// ===== MATCHING =====
async function processTokens(tokenEntries, targetHash) {
    let checked = 0;

    for (let i = 0; i < tokenEntries.length; i += CONFIG.batchSize) {
        const batch = tokenEntries.slice(i, i + CONFIG.batchSize);
        const tokens = batch.map(e => e.token);

        const thumbnails = await safeRequest(() => fetchThumbnails(tokens));

        for (let j = 0; j < thumbnails.length; j++) {
            const thumb = thumbnails[j];
            checked++;

            if (!thumb || !thumb.imageUrl) continue;

            const thumbHash = extractHash(thumb.imageUrl);

            // 🔥 MAIN MATCH
            if (thumbHash && thumbHash === targetHash) {
                return { match: batch[j], checked };
            }

            // ⚠️ FALLBACK (looser match)
            if (thumb.imageUrl && thumb.imageUrl.includes(targetHash)) {
                return { match: batch[j], checked };
            }
        }

        await delay(CONFIG.requestDelay);
    }

    return { match: null, checked };
}

// ===== MAIN =====
async function findPlayer(placeId, userId) {
    let cursor = null;
    let pageCount = 0;
    let totalTokens = 0;

    const targetImage = await safeRequest(() => fetchAvatar(userId));
    const targetHash = extractHash(targetImage);

    if (!targetImage || !targetHash) {
        return {
            success: false,
            error: "Avatar fetch failed"
        };
    }

    do {
        const page = await safeRequest(() => fetchServers(placeId, cursor));

        if (!page || !page.data) break;

        cursor = page.nextPageCursor;
        pageCount++;

        let tokenEntries = [];

        for (const server of page.data) {
            if (!server.playerTokens) continue;

            for (const token of server.playerTokens) {
                tokenEntries.push({
                    token,
                    jobId: server.id,
                    placeId
                });
            }
        }

        totalTokens += tokenEntries.length;

        console.log(`[SCAN] Page ${pageCount} → Tokens: ${tokenEntries.length}`);

        const { match, checked } = await processTokens(tokenEntries, targetHash);

        if (match) {
            console.log(`[FOUND] Match after checking ${checked} tokens`);

            return {
                success: true,
                jobId: match.jobId,
                placeId: match.placeId,
                debug: {
                    serversScanned: pageCount,
                    tokensChecked: totalTokens
                }
            };
        }

        await delay(CONFIG.requestDelay);

    } while (cursor);

    return {
        success: false,
        error: "Player not found",
        debug: {
            serversScanned: pageCount,
            tokensChecked: totalTokens
        }
    };
}

module.exports = { findPlayer };
