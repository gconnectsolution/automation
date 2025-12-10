const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Import the core scraping function from the local file
const { startScrapingFromParams } = require('./scraper'); 

const app = express();
const port = 5500;

// Middleware setup
app.use(cors()); // Allows cross-origin requests from your frontend
app.use(bodyParser.json()); // Parses incoming JSON body from POST requests

// --- API Endpoint ---
app.post('/api/scrape', async (req, res) => {
    // 1. Receive the dynamic parameters from the frontend
    const dynamicQueries = req.body.queries;

    if (!dynamicQueries || dynamicQueries.length === 0) {
        return res.status(400).json({ 
            status: 'error', 
            message: "No queries provided in the request body." 
        });
    }

    // You can also pass the Area ID dynamically if needed, but keeping it hardcoded for now:
    const areaId = 3600063231; // Bengaluru, Karnataka

    try {
        console.log(`Received ${dynamicQueries.length} queries. Starting scrape...`);
        
        // 2. Run the core logic with the received parameters
        const allLeads = await startScrapingFromParams(dynamicQueries, areaId);

        // 3. Send the results back to the frontend
        res.json({
            status: 'success',
            totalLeads: allLeads.length,
            data: allLeads 
        });

    } catch (error) {
        console.error("Scraping failed:", error.message);
        res.status(500).json({ 
            status: 'error', 
            message: `Scraping failed: ${error.message}` 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log("Ready to receive POST requests at http://localhost:3000/api/scrape");
});