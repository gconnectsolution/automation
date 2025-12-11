// server.js
const express = require('express');
const path = require('path');
const { runPipelineLogic } = require('./crawl'); // Import the logic

const app = express();
const PORT = 3000;

// Middleware to serve static files (dashboard.html, dashboard.js)
app.use(express.static(path.join(__dirname)));

// 1. Route to serve the HTML dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// 2. API endpoint to trigger the pipeline logic (called by dashboard.js)
app.post('/run-pipeline', async (req, res) => {
    console.log("--- Web request received to run the pipeline ---");
    try {
        // CALL THE IMPORTED FUNCTION
        const results = await runPipelineLogic(); 
        res.json(results); // Send JSON data back to the frontend
    } catch (error) {
        console.error("Pipeline failed during execution:", error.message);
        // Send a 500 error status back to the frontend
        res.status(500).json({ 
            error: "Pipeline execution failed.",
            details: error.message || "Unknown error."
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n---------------------------------------------------`);
    console.log(`|   DASHBOARD READY  |`);
    console.log(`|  Open your browser to:  |`);
    console.log(`|   http://localhost:${PORT} |`);
    console.log(`---------------------------------------------------\n`);
});