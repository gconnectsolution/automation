const axios = require("axios");
const fs = require("fs");
const XLSX = require("xlsx");
const cheerio = require("cheerio");
const validator = require("validator"); // For email validation
const nodemailer = require("nodemailer"); // Added Nodemailer
const mongoose = require('mongoose');
const bodyParser = require('body-parser'); // Not needed; express.json() handles it
const dotEnv = require('dotenv');
const cors = require('cors'); // For CORS
const userRoutes = require('./routes/userRoutes')
const express = require('express');
const app = express();
const UserModel = require('./model/UserModel');

// Apply CORS FIRST (before any routes or other middleware)
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],  // Added OPTIONS for preflight
    allowedHeaders: ['Content-Type'],
    credentials: false  // No auth needed here
}));

// Then JSON parsing and routes
app.use(express.json());  // Handles body parsing
app.use('/user', userRoutes);

dotEnv.config();
mongoose.connect(process.env.mongo_uri)
.then(() => {
    console.log('mongoDB connected successfully');
})
.catch((e) => {
    console.log('mongoDB connection failed', e.message);
})

// --- GLOBAL FOR PERSISTING LEADS (IN-MEMORY) ---
let currentLeads = [];

// --- CONFIGURATION ---
const OUTPUT_CSV = "leads_scored.csv";
const OUTPUT_XLSX = "leads_scored.xlsx";
// --- STEP 4 CONFIGURATION: EMAIL SENDER ---
const SENDER_EMAIL = 'mailtestings63@gmail.com';
const SENDER_PASS = 'lmsy dulw vscf vrxb'; // Your App Password
const SENDER_NAME = '[Anudeep/G Connect Solutions]';
// Nodemailer transport object (Example: Gmail SMTP)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: SENDER_EMAIL,
        pass: SENDER_PASS,
    },
    pool: true,
    maxMessages: 100,
    maxConnections: 10
});
// Delay function to avoid rate limits (crucial for cold outreach)
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Overpass mirrors for stability and retries
const OVERPASS_URLS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
    "https://overpass-api.de/api/interpreter"
];
// Query: Targets specific, high-density commercial areas to prevent timeouts.
const query = `
[out:json][timeout:45];
area["name"="Bengaluru"]->.a;
(
    // Focus on key commercial neighborhoods
    node(area.a)["addr:street"~"Indiranagar|Jayanagar|HSR Layout|Electronic City|Whitefield|Chickpet"];
    way(area.a)["addr:street"~"Indiranagar|Jayanagar|HSR Layout|Electronic City|Whitefield|Chickpet"];
    relation(area.a)["addr:street"~"Indiranagar|Jayanagar|HSR Layout|Electronic City|Whitefield|Chickpet"];
)->.filtered_businesses;
(
    // Filter the businesses for desired categories
    node.filtered_businesses["amenity"~"restaurant|cafe|fast_food|bar|pub|clinic|hospital|doctors|pharmacy|dentist|gym"];
    node.filtered_businesses["shop"~"bakery|supermarket|convenience|clothes|electronics|furniture|books|sports"];
    node.filtered_businesses["office"~"estate_agent|real_estate|architect"];
);
out body;
>;
out skel qt;
`;
// =========================================================
//             CORE UTILITY FUNCTIONS (STEP 1 & 2)
// =========================================================
async function fetchOverpass(query, retries = 3) {
    for (const url of OVERPASS_URLS) {
        for (let i = 0; i < retries; i++) {
            try {
                console.log(`\n\tFetching from ${url} (attempt ${i + 1})...`);
                const res = await axios.post(url, query, {
                    headers: { "Content-Type": "text/plain" },
                    timeout: 60000
                });
                if (res.data && res.data.elements && res.data.elements.length > 0) {
                    return res.data;
                }
            } catch (err) {
                console.warn(`\tWarning: Failed on ${url}. Error: ${err.message}`);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
    throw new Error("All Overpass servers failed or returned no data.");
}
async function findEmail(url) {
    if (!url || !url.startsWith('http')) return null;
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    try {
        const res = await axios.get(url, {
            timeout: 7000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = res.data;
        const matches = html.match(emailRegex);
        if (matches) {
            const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase().trim()))];
            return uniqueEmails.find(e => validator.isEmail(e)) || null;
        }
    } catch (e) {
        // Silently skip websites that fail to load
    }
    return null;
}
// =========================================================
//              LEAD SCORING FUNCTION (STEP 3)
// =========================================================
function scoreLead(lead) {
    let score = 0;
    const name = lead.name.toLowerCase();
    const category = lead.category.toLowerCase();
   
    const GENERIC_PREFIXES = ['info', 'contact', 'support', 'sales', 'admin'];
    const isGenericEmail = lead.email && GENERIC_PREFIXES.some(prefix => lead.email.toLowerCase().startsWith(prefix));
   
    // SCORING RULES
    if (category.includes('architect') || category.includes('real_estate')) {
        score += 15;
    } else if (category.includes('restaurant') || category.includes('cafe') || category.includes('gym')) {
        score += 10;
    }
    if (name.includes('group') || name.includes('pvt') || name.includes('corp') || name.includes('ltd')) {
        score += 10;
    }
    if (lead.email) {
         if (!isGenericEmail) {
            score += 5; // Bonus for a seemingly personalized email
        } else {
            score -= 5; // Penalty for generic email
        }
    }
    // ASSIGN PRIORITY LEVEL
    lead.final_score = Math.max(0, score);
    if (lead.final_score >= 25) {
        lead.priority_level = "HOT_LEAD";
    } else if (lead.final_score >= 10) {
        lead.priority_level = "WARM_LEAD";
    } else {
        lead.priority_level = "COLD_LEAD";
    }
    return lead;
}
// =========================================================
//              EMAIL TEMPLATING AND SENDING
// =========================================================
function getFirstName(businessName) {
    if (!businessName) return "Team";
    let cleanedName = businessName.replace(/pvt|ltd|group|corp|est|&|and|'s/gi, '').trim();
    const parts = cleanedName.split(/\s+/);
    if (parts.length > 0 && parts[0].length > 2 && parts[0].length < 10) {
        return parts[0];
    }
    return "Team";
}
// =========================================================
//   CAPTURE INTEREST -> SAVE TO DB -> REDIRECT TO CALENDAR
// =========================================================
app.get('/user/interested', async (req, res) => {
    const { email, name, category } = req.query;
    const calendarLink = "https://calendar.app.google/mepp8MDWBPF24WQ28";
    if (!email) return res.status(400).send("Email parameter is missing.");
    try {
        // This creates a NEW record or UPDATES an existing one based on email
        await UserModel.findOneAndUpdate(
            { email: email.toLowerCase() },
            {
                name: decodeURIComponent(name),
                category: decodeURIComponent(category),
                status: "INTERESTED",
                clickedAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`✨ Lead Interested & Saved: ${email}`);
        // Automatically send the customer to your calendar
        res.redirect(calendarLink);
    } catch (err) {
        console.error("Database save failed:", err);
        res.status(500).send("An error occurred while processing your request.");
    }
});
function generateEmailContent(lead) {
    const recipientName = getFirstName(lead.name);
    const businessName = lead.name;
    const website = lead.raw_website;
    const category = lead.category;
    const senderEmail = SENDER_EMAIL;
   
    let subject = '';
    let textBody = '';
   
    // --- DATABASE TRACKING LINK ---
    const baseUrl = "http://localhost:3001/user/interested";
    const interestLink = `${baseUrl}?email=${encodeURIComponent(lead.email)}&name=${encodeURIComponent(lead.name)}&category=${encodeURIComponent(lead.category)}`;
    const replySubject = `Re: ${businessName} - Local Strategy`;
    const replyLinkNo = `mailto:${senderEmail}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent("Thanks for reaching out, but we are not interested at this time.")}`;
   
    const buttonStyle = "display: inline-block; padding: 12px 25px; margin: 10px 5px 10px 0; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; text-align: center;";
    const replyButtonsHTML = `
        <div style="margin-top: 20px;">
            <a href="${interestLink}" style="${buttonStyle} background-color: #4CAF50;">Yes, I'm Interested</a>
            <a href="${replyLinkNo}" style="${buttonStyle} background-color: #f44336;">No, Not Interested</a>
        </div>
    `;
    if (lead.priority_level === 'HOT_LEAD') {
        subject = `Proposed Digital Growth Plan for ${businessName} — Quick Google Meet?`;
        textBody = `
Hi ${recipientName},
I’m Anudeep from G Connect Solutions. We help established Bengaluru businesses turn local online searches into real customer visits.
I reviewed ${businessName}'s online presence and identified a few immediate opportunities to increase qualified traffic—especially for customers searching nearby for ${category} services.
Rather than sending generic suggestions, I’d prefer to walk you through a tailored digital growth plan in a short Google Meet call.
Click the button below to choose a convenient time from my calendar:
Best regards,  
Anudeep  
G Connect Solutions
        `;
    }
    else if (lead.priority_level === 'WARM_LEAD') {
        subject = `Quick Google Meet to review your ${category} visibility in Bengaluru?`;
        textBody = `
Hello ${recipientName},
I’m Anudeep from G Connect Solutions. We work with Bengaluru-based businesses to improve local visibility and ensure their websites generate consistent customer inquiries.
While reviewing ${businessName}, I noticed a few practical improvements that could help your website (${website}) attract more nearby customers searching for ${category} services.
If you’re open to it, I’d be happy to discuss these insights over a short Google Meet.
Click "Yes, I'm Interested" below to see my availability:
Looking forward to connecting.
Regards,  
Anudeep  
G Connect Solutions
        `;
    }
    else { // COLD_LEAD
        subject = `Idea to improve local visibility for ${businessName}`;
        textBody = `
Hi ${recipientName},
Hope things are going well at ${businessName}.
I’m Anudeep from G Connect Solutions, a Bengaluru-based digital marketing team helping local businesses improve how they appear in Google and map-based searches.
Even small visibility gaps—like incomplete listings or missed local signals—can reduce how often potential customers find you.
If it’s useful, I’d be happy to share a few general insights relevant to ${category} businesses.
Click below to pick a time that works for you:
Thanks for your time,  
Anudeep  
G Connect Solutions
        `;
    }
    const htmlBody = `
        <p style="white-space: pre-wrap; font-family: sans-serif;">${textBody.trim()}</p>
        ${replyButtonsHTML}
    `;
    return { subject, textBody, htmlBody };
}
async function sendEmail(lead) {
    if (!lead.email) {
        console.warn(`Skipping email: No email found for ${lead.name}`);
        lead.status = "NO_EMAIL";
        return;
    }
    const { subject, textBody, htmlBody } = generateEmailContent(lead);
    const mailOptions = {
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: lead.email,
        subject: subject,
        text: textBody.trim(),
        html: htmlBody,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`\t✅ Email sent to ${lead.email} (${lead.priority_level})`);
        lead.status = "SENT_SUCCESS";
    } catch (error) {
        console.error(`\t❌ FAILED email to ${lead.email}: ${error.message}`);
        lead.status = "EMAIL_FAILED";
    }
}
// =========================================================
//              NEW ENDPOINT: SEND ALL PENDING EMAILS
// =========================================================
app.post('/send-all', async (req, res) => {
    console.log("--- Sending all pending emails ---");
    try {
        let sentCount = 0;
        for (let lead of currentLeads) {
            if (lead.status === 'PENDING') {
                await sendEmail(lead);
                sentCount++;
                await delay(5000); // Rate limit delay
            }
        }
        res.json({ success: true, sent: sentCount });
    } catch (error) {
        console.error("Send All failed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// =========================================================
//              NEW ENDPOINT: GET CURRENT LEADS
// =========================================================
app.get('/get-leads', (req, res) => {
    res.json(currentLeads.map(l => ({
        Name: l.name,
        Category: l.category,
        Email: l.email,
        Website: l.raw_website,
        Score: l.final_score,
        Priority: l.priority_level,
        Status: l.status
    })));
});
// Add CORS middleware
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json()); // Move after CORS if not already
// =========================================================
//              OUTPUT FUNCTIONS
// =========================================================
function toCSV(rows) {
    const header = "name,email,website,category,address,final_score,priority_level,status\n";
    const lines = rows.map(r =>
        `"${r.name.replace(/"/g, '""')}","${r.email || ''}","${r.raw_website || ''}","${r.category}","${r.address.replace(/"/g, '""')}",${r.final_score || 0},"${r.priority_level || 'N/A'}","${r.status}"`
    );
    return header + lines.join("\n");
}
function saveExcel(data) {
    const cleanData = data.map(r => ({
        Name: r.name,
        Email: r.email || '',
        Website: r.raw_website || '',
        Category: r.category,
        Address: r.address,
        Score: r.final_score || 0,
        Priority: r.priority_level || 'N/A',
        Status: r.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Scored Leads");
    XLSX.writeFile(workbook, OUTPUT_XLSX);
    console.log("✅ Excel saved →", OUTPUT_XLSX);
}
// =========================================================
//             MAIN EXECUTION FLOW (FULL LOGIC)
// =========================================================
const TEST_EMAIL_RECIPIENT = "anudeep982@gmail.com";
const RUN_TEST_MODE = false;
async function runPipelineLogic() {
    try {
        
        console.log("1. Starting OSM Data Fetch...");
        const data = await fetchOverpass(query);
        if (!data || !data.elements) throw new Error("No data found");
        let leads = data.elements
            .filter(el => el.tags && el.tags.name)
            .map(el => ({
                name: el.tags.name,
                raw_website: el.tags.website || "",
                raw_email: el.tags.email || "",
                category: el.tags.amenity || el.tags.shop || "Business",
                address: el.tags["addr:street"] || "Bengaluru",
                email: null
            }));
        if (RUN_TEST_MODE) {
            const mockLead = {
                name: leads[0]?.name || "Anudeep",
                raw_website: leads[0]?.raw_website || "https://gconnectsolutions.com",
                category: leads[0]?.category || "Architect",
                email: TEST_EMAIL_RECIPIENT,
                final_score: 25,
                priority_level: "HOT_LEAD",
                status: "PENDING"
            };
            console.log(`Test mode: Prepared mock lead for ${mockLead.email}`);
            currentLeads = [mockLead];
            return [{
                Name: mockLead.name,
                Category: mockLead.category,
                Email: mockLead.email,
                Website: mockLead.raw_website,
                Score: mockLead.final_score,
                Priority: mockLead.priority_level,
                Status: mockLead.status
            }];
        }
        const seen = new Set();
        const uniqueLeads = leads.filter(r => {
            const key = (r.name + r.address).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const finalLeads = [];
        for (let lead of uniqueLeads) {
            lead.email = validator.isEmail(lead.raw_email) ? lead.raw_email : await findEmail(lead.raw_website);
            if (lead.email) {
                const scored = scoreLead(lead);
                scored.status = "PENDING"; // Set pending - no send yet
                finalLeads.push(scored);
                await delay(1000); // Light delay during scraping
            }
        }
        currentLeads = finalLeads; // Store for later sending
      
        fs.writeFileSync(OUTPUT_CSV, toCSV(finalLeads));
        saveExcel(finalLeads);
      
        return finalLeads.map(l => ({
            Name: l.name,
            Category: l.category,
            Email: l.email,
            Website: l.raw_website,
            Score: l.final_score,
            Priority: l.priority_level,
            Status: l.status
        }));
    } catch (err) {
        console.error("Pipeline Error:", err.message);
        throw err;
    }
}

// Add this new function to your crawl.js
async function runSearchLogic(city, category) {
    try {
        console.log(`1. Finding coordinates for city: ${city}...`);
        
        // Step A: Get City Area ID from Nominatim
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`;
        const cityRes = await axios.get(nominatimUrl, { headers: { 'User-Agent': 'LeadGenApp/1.0' } });

        if (!cityRes.data || cityRes.data.length === 0) throw new Error("City not found");
        
        // Convert OSM ID to Overpass Area ID
        const areaId = cityRes.data[0].osm_id + 3600000000;

        // Step B: Build Dynamic Query
        const dynamicQuery = `
            [out:json][timeout:60];
            area(${areaId})->.searchArea;
            (
              nwr["amenity"~"${category}",i](area.searchArea);
              nwr["shop"~"${category}",i](area.searchArea);
              nwr["office"~"${category}",i](area.searchArea);
            );
            out body;
            >;
            out skel qt;
        `;

        console.log("2. Fetching businesses from Overpass...");
        const data = await fetchOverpass(dynamicQuery);
        if (!data || !data.elements) throw new Error("No businesses found for this category in this city.");

        // Step C: Process results using your existing pipeline
        let leads = data.elements
            .filter(el => el.tags && el.tags.name)
            .map(el => ({
                name: el.tags.name,
                raw_website: el.tags.website || "",
                raw_email: el.tags.email || "",
                category: el.tags.amenity || el.tags.shop || el.tags.office || category,
                address: el.tags["addr:street"] ? `${el.tags["addr:street"]}, ${city}` : city,
                email: null
            }));

        // Remove duplicates
        const seen = new Set();
        const uniqueLeads = leads.filter(r => {
            const key = (r.name + r.address).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const finalLeads = [];
        console.log(`3. Found ${uniqueLeads.length} unique businesses. Finding emails...`);

        for (let lead of uniqueLeads) {
            // Use your existing findEmail function
            lead.email = validator.isEmail(lead.raw_email) ? lead.raw_email : await findEmail(lead.raw_website);
            
            if (lead.email) {
                // Use your existing scoreLead function
                const scored = scoreLead(lead);
                scored.status = "PENDING";
                finalLeads.push(scored);
                await delay(500); // Light delay
            }
        }

        currentLeads = finalLeads; // Update the global variable
        
        // Save files using your existing functions
        fs.writeFileSync(OUTPUT_CSV, toCSV(finalLeads));
        saveExcel(finalLeads);

        return finalLeads.map(l => ({
            Name: l.name,
            Category: l.category,
            Email: l.email,
            Website: l.raw_website,
            Score: l.final_score,
            Priority: l.priority_level,
            Status: l.status,
            Address: l.address // Added for the details view
        }));

    } catch (err) {
        console.error("Search Pipeline Error:", err.message);
        throw err;
    }
}


//app.listen('3001', () => {
//    console.log('server running on http://localhost:3001')
//})
// Export the new function as well
module.exports = { runPipelineLogic, runSearchLogic };