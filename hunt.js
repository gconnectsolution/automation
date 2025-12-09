const fs = require('fs-extra');
const axios = require('axios');
const cheerio = require('cheerio');

const INPUT_FILE = 'leads_stage1_websites.json';
const OUTPUT_FILE = 'leads_final_with_emails.csv';

// Simple Regex to find email addresses
const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

async function huntForEmails() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`🚨 Error: ${INPUT_FILE} not found. Run Stage 1 first.`);
        return;
    }
    
    let leads = await fs.readJson(INPUT_FILE);
    let finalLeads = [];

    console.log(`--- Starting Email Hunt on ${leads.length} leads ---`);
    
    for (const lead of leads) {
        if (!lead.websiteUrl) {
            console.log(`Skipping ${lead.name}: No website URL found.`);
            continue;
        }

        try {
            // 1. Fetch the website HTML using Axios
            const response = await axios.get(lead.websiteUrl, {
                // Mimic a real browser user-agent to avoid simple blocks
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
            });
            
            // 2. Load the HTML into Cheerio for super-fast parsing
            const $ = cheerio.load(response.data);
            
            // 3. Extract all text and search for emails
            const pageText = $('body').text();
            const emailsFound = new Set(pageText.match(emailRegex)); // Use a Set to store unique emails
            
            lead.email = emailsFound.size > 0 ? Array.from(emailsFound).join('; ') : 'N/A';
            
            finalLeads.push(lead);
            console.log(`✅ Found: ${lead.name} -> ${lead.email}`);

            // PRO TIP: Add a random delay to prevent IP bans
            const delay = Math.floor(Math.random() * 500) + 500; // 500ms to 1000ms delay
            await new Promise(r => setTimeout(r, delay));

        } catch (error) {
            // 4. Gracefully handle errors (like 404 or connection timeouts)
            lead.email = `ERROR: ${error.message.substring(0, 50)}`;
            finalLeads.push(lead);
            console.error(`❌ Error scraping ${lead.name}: ${error.message}`);
        }
    }

    // 5. Convert to CSV format and save
    const csvContent = "Name,Website URL,Email\n" + 
                       finalLeads.map(l => `"${l.name.replace(/"/g, '""')}","${l.websiteUrl}","${l.email}"`).join('\n');
    
    fs.writeFileSync(OUTPUT_FILE, csvContent);
    console.log(`\n🎉 Final data saved to ${OUTPUT_FILE}`);
}

huntForEmails();