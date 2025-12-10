const axios = require("axios");
const fs = require("fs");
const XLSX = require("xlsx");

// The official Overpass API endpoint
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Define categories using OSM tags and keywords for filtering
// Format: { area_name: 'Bangalore', query_tag: 'amenity=restaurant', keyword_filter: '' }
const TARGET_QUERIES = [
    { name: "Digital Marketing/Web Dev", tag: "office", keyword: "marketing|digital|website|consulting" },
    { name: "Restaurants", tag: "amenity", keyword: "restaurant" },
    { name: "Real Estate Agents", tag: "office", keyword: "real_estate" },
    { name: "Gyms/Fitness", tag: "leisure", keyword: "fitness_centre|gym" },
];

// --- CORE SCRAPING LOGIC ---

async function fetchOSMData(query) {
    // 3600063231 is the Area ID for Bengaluru, Karnataka
    const areaId = 3600063231; 
    
    // Construct the Overpass QL
    const overpassQuery = `
[out:json][timeout:60];
area(${areaId})->.searchArea;
(
  node["${query.tag}"~"${query.keyword}", i](area.searchArea);
  way["${query.tag}"~"${query.keyword}", i](area.searchArea);
  relation["${query.tag}"~"${query.keyword}", i](area.searchArea);
);
out center;
`;

    console.log(`\n--- Querying OSM: ${query.name} ---`);

    try {
        const response = await axios.post(OVERPASS_URL, overpassQuery, {
            headers: { 
                "Content-Type": "application/x-www-form-urlencoded" 
            },
            timeout: 60000 
        });

        const elements = response.data.elements;
        const leads = [];

        elements.forEach(el => {
            // Data is extracted directly from the 'tags' object in the JSON response
            const tags = el.tags || {};
            
            // OSM does not always have phone/email, so we extract what is available
            const name = tags.name || 'N/A';
            const address = tags['addr:full'] || tags['addr:street'] || tags.addr || 'N/A';
            const phone = tags.phone || tags['contact:phone'] || 'N/A';
            
            // Latitude and Longitude are always available in the structured JSON
            const lat = el.lat || el.center?.lat || 'N/A';
            const lon = el.lon || el.center?.lon || 'N/A';

            // New (Relaxed, only requires a name)
if (name !== 'N/A') {
    leads.push({
        name,
        address,
        // The phone number can now be 'Invalid or Missing'
        phone, 
        category: query.name,
        lat,
        lon,
        osm_type: el.type,
    });
}
        });
        
        console.log(`  Successfully extracted ${leads.length} leads.`);
        return leads;

    } catch (error) {
        console.error(`  ⛔ Error fetching data for ${query.name}: ${error.message}`);
        // Log the full error response for debugging rate limits
        if (error.response) {
            console.error(`  Server response status: ${error.response.status}`);
        }
        return [];
    }
}

// --- Data Saving Functions (Adjusted for OSM data) ---

function toCSV(rows) {
    const header = "Business Name,Address,Phone,Category,Latitude,Longitude,OSM Type\n";
    const lines = rows.map(r =>
        `"${r.name.replace(/"/g, '""')}","${r.address.replace(/"/g, '""')}","${r.phone}","${r.category}","${r.lat}","${r.lon}","${r.osm_type}"`
    );
    return header + lines.join("\n");
}

function saveExcel(data) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OSM Bangalore Leads"); 
    XLSX.writeFile(wb, "bangalore_osm_leads.xlsx"); 
}

// --- Main Execution ---

async function startScraping() {
    let allLeads = [];

    for (let query of TARGET_QUERIES) {
        const leads = await fetchOSMData(query);
        allLeads.push(...leads);
    }

    console.log("\n=============================================");
    console.log(`🎉 OSM Data Extraction Complete! Total leads collected: ${allLeads.length}`);
    console.log("=============================================");

    fs.writeFileSync("bangalore_osm_leads.csv", toCSV(allLeads));
    console.log("✅ CSV saved: bangalore_osm_leads.csv");

    saveExcel(allLeads);
    console.log("✅ Excel saved: bangalore_osm_leads.xlsx");
}

startScraping();