require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");

const { runSearchLogic, runPipelineLogic } = require("./crawl");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* =========================
   MONGODB CONNECTION
========================= */
mongoose
  .connect(process.env.MONGODB_URI, {
    autoIndex: false
  })
  .then(() => {
    console.log("✅ MongoDB Connected");
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Failed:", err.message);
    process.exit(1);
  });

/* =========================
   ROUTES
========================= */

// Dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Run pipeline
app.post("/run-pipeline", async (req, res) => {
  console.log("--- Running Bengaluru pipeline ---");
  try {
    const results = await runPipelineLogic();
    res.json(results);
  } catch (error) {
    console.error("Pipeline failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Search user
app.post("/search-user", async (req, res) => {
  const { cities, category } = req.body;
  console.log(`Multi-city search: cities="${cities}", category="${category}"`);
  try {
    const results = await runSearchLogic(cities, category);
    res.json(results);
  } catch (error) {
    console.error("Multi-city search failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   SERVER START (DOCKER SAFE)
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log("---------------------------------------------------");
  console.log("|   AUTOMATION DASHBOARD - PRODUCTION READY       |");
  console.log(`|   Running on port ${PORT}                        |`);
  console.log("---------------------------------------------------");
});
