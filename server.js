const axios = require("axios");
const fs = require("fs");
const XLSX = require("xlsx");
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// This is the correct way to include your scraping logic
const { startScrapingFromParams } = require('./scraper'); 

const app = express();
const port = 3000;

const OUTPUT_CSV = "bangalore_osm.csv";
const OUTPUT_XLSX = "bangalore_osm.xlsx";

// Overpass mirrors
const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

// Query: only local businesses (restaurants, bakeries, gyms, clinics, real estate, etc.)
const query = `
[out:json][timeout:25];
area["name"="Bengaluru"]->.a;
(
  node(area.a)["amenity"~"restaurant|cafe|fast_food|bar|pub|clinic|hospital|doctors|pharmacy|dentist|gym"];
  node(area.a)["shop"~"bakery|supermarket|convenience|clothes|electronics|furniture|books|sports"];
  node(area.a)["office"~"estate_agent|real_estate"];
);
out body;
>;
out skel qt;
`;

async function fetchOverpass(query, retries = 3) {
  for (const url of OVERPASS_URLS) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Fetching from ${url} (attempt ${i + 1})...`);
        const res = await axios.post(url, query, {
          headers: { "Content-Type": "text/plain" },
          timeout: 60000
        });
        if (res.data && res.data.elements) {
          return res.data;
        }
      } catch (err) {
        console.warn(`Error from ${url}: ${err.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  throw new Error("All Overpass servers failed");
}

function toCSV(rows) {
  const header = "name,email,phone,website,category,address\n";
  const lines = rows.map(r =>
    `"${r.name}","${r.email}","${r.phone}","${r.website}","${r.category}","${r.address}"`
  );
  return header + lines.join("\n");
}

function saveExcel(data) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  XLSX.writeFile(workbook, OUTPUT_XLSX);
  console.log("✅ Excel saved →", OUTPUT_XLSX);
}

(async () => {
  try {
    console.log("Fetching OSM data...");
    const data = await fetchOverpass(query);

    const results = data.elements
      .filter(el => el.tags && el.tags.name)
      .map(el => ({
        name: el.tags.name || "",
        email: el.tags.email|| "",
        phone: el.tags.phone || "",
        website: el.tags.website || "",
        category:
          el.tags.amenity ||
          el.tags.shop ||
          el.tags.office ||
          "",
        address: `${el.tags["addr:housenumber"] || ""} ${el.tags["addr:street"] || ""}, ${el.tags["addr:city"] || ""} ${el.tags["addr:postcode"] || ""}`
      }));

    // Deduplicate by name+address
    const seen = new Set();
    const unique = results.filter(r => {
      const key = r.name + r.address;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log("📊 Total businesses extracted:", unique.length);

    fs.writeFileSync(OUTPUT_CSV, toCSV(unique));
    console.log("✅ CSV saved →", OUTPUT_CSV);

    saveExcel(unique);
  } catch (err) {
    console.error("❌ Scraping failed:", err.message);
  }
})();
