const express = require("express");
const { findPlayer } = require("./sniper");

const app = express();
app.use(express.json());

// Basic health check
app.get("/", (req, res) => {
    res.send("Sniper API is running");
});

// MAIN ENDPOINT
app.get("/snipe", async (req, res) => {
    const { placeId, userId } = req.query;

    if (!placeId || !userId) {
        return res.status(400).json({
            success: false,
            error: "Missing placeId or userId"
        });
    }

    try {
        console.log(`[REQUEST] placeId=${placeId} userId=${userId}`);

        const result = await findPlayer(placeId, userId);

        console.log(`[RESULT]`, result);

        res.json(result);

    } catch (err) {
        console.error("[ERROR]", err);

        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
