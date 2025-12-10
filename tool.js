const express = require("express");
const app = express();
const PORT = 3000;

let cachedData = []; // store scraped data

// Endpoint to fetch scraped businesses
app.get("/api/businesses", (req, res) => {
  res.json(cachedData);
});

// Run scraping and cache results
(async () => {
  try {
    console.log("Fetching OSM data...");
    const data = await fetchOverpass(query);

    const results = data.elements
      .filter(el => el.tags && el.tags.name)
      .map(el => ({
        name: el.tags.name || "",
        phone: el.tags.phone || "",
        website: el.tags.website || "",
        category:
          el.tags.amenity ||
          el.tags.shop ||
          el.tags.office ||
          "",
        address: `${el.tags["addr:housenumber"] || ""} ${el.tags["addr:street"] || ""}, ${el.tags["addr:city"] || ""} ${el.tags["addr:postcode"] || ""}`
      }));

    const seen = new Set();
    cachedData = results.filter(r => {
      const key = r.name + r.address;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log("📊 Total businesses extracted:", cachedData.length);
  } catch (err) {
    console.error("❌ Scraping failed:", err.message);
  }
})();

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
