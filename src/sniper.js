// src/sniper.js

const axios = require("axios");

// ===== CONFIG =====
const CONFIG = {
    batchSize: 50,
    requestDelay: 800,
    maxRetries: 5,
    passes: 3,
    concurrency: 3
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// ===== RATE-LIMIT SAFE REQUEST =====
async function safeRequest(fn, retries = CONFIG.maxRetries) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            const status = err.response?.status;

            if (status === 429) {
                const retryAfter = parseInt(err.response.headers["retry-after"] || "5") * 1000;
                console.log(`[RATE LIMIT] Waiting ${retryAfter}ms`);
                await delay(retryAfter);
            } else {
                console.log("[ERROR]", err.message);
                await delay(1000);
            }

            if (i === retries - 1) throw err;
        }
    }
}

// ===== HELPERS =====
function extractHash(url) {
    if (!url) return null;
    const match = url.match(/rbxcdn\.com\/([^/]+)/);
    return match ? match[1] : null;
}

// ===== API =====
async function fetchServers(placeId, cursor = null) {
    return safeRequest(async () => {
        const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
        const res = await axios.get(url);

        return {
            data: res.data?.data || [],
            nextPageCursor: res.data?.nextPageCursor || null
        };
    });
}

async function fetchAvatar(userId) {
    return safeRequest(async () => {
        const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`;
        const res = await axios.get(url);

        return res.data?.data?.[0]?.imageUrl || null;
    });
}

async function fetchThumbnails(tokens) {
    if (!tokens.length) return [];

    return safeRequest(async () => {
        const body = tokens.map(token => ({
            requestId: `0:${token}:AvatarHeadshot:420x420:png:regular`,
            type: "AvatarHeadShot",
            token,
            format: "png",
            size: "420x420"
        }));

        const res = await axios.post(
            "https://thumbnails.roblox.com/v1/batch",
            body,
            { headers: { "Content-Type": "application/json" } }
        );

        return res.data?.data || [];
    });
}

// ===== PROCESS TOKENS =====
async function processTokens(entries, targetHash) {
    let checked = 0;

    for (let i = 0; i < entries.length; i += CONFIG.batchSize) {
        const batch = entries.slice(i, i + CONFIG.batchSize);

        const thumbnails = await fetchThumbnails(batch.map(e => e.token));

        for (let j = 0; j < thumbnails.length; j++) {
            const thumb = thumbnails[j];
            checked++;

            if (!thumb?.imageUrl) continue;

            const hash = extractHash(thumb.imageUrl);

            if (hash && hash === targetHash) {
                return { match: batch[j], checked };
            }
        }

        await delay(CONFIG.requestDelay);
    }

    return { match: null, checked };
}

// ===== MAIN =====
async function findPlayer(placeId, userId) {
    const targetImage = await fetchAvatar(userId);
    const targetHash = extractHash(targetImage);

    if (!targetHash) {
        return { success: false, error: "Avatar fetch failed" };
    }

    let totalTokens = 0;
    let serversSeen = new Set();

    // 🔁 MULTI-PASS SCANNING
    for (let pass = 1; pass <= CONFIG.passes; pass++) {
        console.log(`\n[PASS ${pass}] Starting scan`);

        let cursor = null;

        do {
            const page = await fetchServers(placeId, cursor);

            cursor = page.nextPageCursor;

            let entries = [];

            for (const server of page.data) {
                serversSeen.add(server.id);

                for (const token of (server.playerTokens || [])) {
                    entries.push({
                        token,
                        jobId: server.id,
                        placeId
                    });
                }
            }

            totalTokens += entries.length;

            console.log(`[SCAN] Tokens this page: ${entries.length}`);

            const { match } = await processTokens(entries, targetHash);

            if (match) {
                console.log("[FOUND] Player located");

                return {
                    success: true,
                    jobId: match.jobId,
                    placeId: match.placeId,
                    debug: {
                        tokensChecked: totalTokens,
                        passesUsed: pass,
                        serversScanned: serversSeen.size
                    }
                };
            }

            await delay(CONFIG.requestDelay);

        } while (cursor);

        // 🔁 SMALL DELAY BETWEEN PASSES
        await delay(2000);
    }

    return {
        success: false,
        error: "Player not found",
        debug: {
            tokensChecked: totalTokens,
            passesUsed: CONFIG.passes,
            serversScanned: serversSeen.size
        }
    };
}

module.exports = { findPlayer };
