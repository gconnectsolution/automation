const axios = require("axios");
// Using require() to match CommonJS module system
const { parsePhoneNumberFromString } = require('libphonenumber-js'); 

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Helper function to validate and format phone numbers for India (IN)
function validateAndFormatPhone(phone, countryCode = 'IN') {
    if (!phone || phone === 'N/A') return 'N/A';
    
    try {
        const phoneNumber = parsePhoneNumberFromString(phone, countryCode);
        
        if (phoneNumber && phoneNumber.isValid()) {
            return phoneNumber.format('E.164');
        }
    } catch (e) {
        // Log errors internally but continue
    }
    return 'Invalid or Missing';
}


// Fetches data for a single dynamic query
async function fetchOSMData(query, areaId) {
    // Construct the Overpass QL with tag/keyword/area variables
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
    console.log(`\n--- Querying OSM for: ${query.name} (Tag: ${query.tag}, Keyword: ${query.keyword}) ---`);

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
            const tags = el.tags || {};
            
            const name = tags.name || 'N/A';
            const address = tags['addr:full'] || tags['addr:street'] || tags.addr || 'N/A';
            const rawPhone = tags.phone || tags['contact:phone'] || 'N/A';
            
            // Validate the phone number (will return 'Invalid or Missing' if bad/absent)
            const phone = validateAndFormatPhone(rawPhone);
            
            const lat = el.lat || el.center?.lat || 'N/A';
            const lon = el.lon || el.center?.lon || 'N/A';

            // *** FIX: Relaxed Filter ***
            // We only require a name. Leads without a phone number are still included.
            if (name !== 'N/A') {
                leads.push({
                    name,
                    address,
                    phone, // This will be the validated number or 'Invalid/Missing'
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
        return [];
    }
}


// Main entry point called by server.js
async function startScrapingFromParams(TARGET_QUERIES, areaId) {
    let allLeads = [];

    for (let query of TARGET_QUERIES) {
        if (query.tag && query.keyword) {
            // Add a small delay between queries to respect Overpass rate limits
            await new Promise(resolve => setTimeout(resolve, 2000)); 
            
            const leads = await fetchOSMData(query, areaId);
            allLeads.push(...leads);
        }
    }
    
    return allLeads; 
}

// Export the main function for use by server.js
module.exports = { startScrapingFromParams };