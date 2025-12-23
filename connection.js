// connection.js (Dashboard Server - Port 3000)
const express = require('express');
const path = require('path');
const cors = require('cors');  // Optional for safety
const { runSearchLogic, runPipelineLogic } = require('./crawl'); // Import logic
const app = express();
const PORT = 3000;  // Fixed to 3000 for dashboard

app.use(cors());  // Allow all origins (safe for dev)
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Run Pipeline (scrapes Bengaluru defaults)
app.post('/run-pipeline', async (req, res) => {
    console.log("--- Web request received to run the pipeline ---");
    try {
        const results = await runPipelineLogic();
        res.json(results);
    } catch (error) {
        console.error("Pipeline failed during execution:", error.message);
        res.status(500).json({
            error: "Pipeline execution failed.",
            details: error.message || "Unknown error."
        });
    }
});

// New: Custom Search
app.post('/search-user', async (req, res) => {
    const { city, category } = req.body;
    console.log(`DEBUG: Received search request: city="${city}", category="${category}"`);
    try {
        const results = await runSearchLogic(city, category);
        console.log(`DEBUG: Search completed, returning ${results.length} leads`);
        res.json(results);
    } catch (error) {
        console.error("Search failed:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n---------------------------------------------------`);
    console.log(`|   DASHBOARD READY  |`);
    console.log(`|  Open your browser to:  |`);
    console.log(`|   http://localhost:${PORT} |`);
    console.log(`---------------------------------------------------\n`);
});