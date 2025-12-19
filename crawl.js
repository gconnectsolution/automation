const axios = require("axios");
const fs = require("fs");
const XLSX = require("xlsx");
const cheerio = require("cheerio"); 
const validator = require("validator"); // For email validation
const nodemailer = require("nodemailer"); // Added Nodemailer
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const dotEnv = require('dotenv');
const userRoutes = require('./routes/userRoutes')
const express = require('express');
const app = express()

app.use(express.json())
app.use('/user', userRoutes);
dotEnv.config();

mongoose.connect(process.env.mongo_uri)
.then(() => {
    console.log('mongoDB connected successfully');
})
.catch((e) => {
    console.log('mongoDB connection failed', e.message);
})

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
//            CORE UTILITY FUNCTIONS (STEP 1 & 2)
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
//             LEAD SCORING FUNCTION (STEP 3)
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
//             EMAIL TEMPLATING AND SENDING
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

// ... (The top part of your script remains the same)

// =========================================================
//             EMAIL TEMPLATING AND SENDING (MODIFIED)
// =========================================================

// ... (getFirstName function remains the same)

function generateEmailContent(lead) {
    const recipientName = getFirstName(lead.name);
    const businessName = lead.name;
    const website = lead.raw_website;
    const category = lead.category;
    const senderEmail = SENDER_EMAIL; // Use the global sender email for the reply-to
    
    let subject = '';
    let textBody = '';
    
    // --- REPLY BUTTON CONFIGURATION ---
    const replySubject = `Re: ${businessName} - Local Strategy`;
    
    // Quick Reply Links (These create a draft email when clicked)
    const replyLinkYes = `mailto:${senderEmail}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent("Hi Anudeep, Yes, I'm interested in the strategy you mentioned. Let's talk!")}`;
    const replyLinkNo = `mailto:${senderEmail}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent("Thanks for reaching out, but we are not interested at this time.")}`;
    
    // HTML Button Styles
    const buttonStyle = "display: inline-block; padding: 10px 20px; margin: 10px 5px 10px 0; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; text-align: center;";
    const replyButtonsHTML = `
        <div style="margin-top: 20px;">
            <a href="${replyLinkYes}" style="${buttonStyle} background-color: #4CAF50;">Yes, I'm Interested</a>
            <a href="${replyLinkNo}" style="${buttonStyle} background-color: #f44336;">No, Not Interested</a>
        </div>
    `;

    // ----------------------------------------------------
    // TEMPLATE GENERATION (Now generates plain text and HTML)
    // ----------------------------------------------------
    
    const calendarLink = "https://calendar.app.google/mepp8MDWBPF24WQ28"; 
    // or Calendly link if you prefer

    if (lead.priority_level === 'HOT_LEAD') {
    subject = `Proposed Digital Growth Plan for ${businessName} — Quick Google Meet?`;

    textBody = `
    Hi ${recipientName},

    I’m Anudeep from G Connect Solutions. We help established Bengaluru businesses turn local online searches into real customer visits.
    I reviewed ${businessName}'s online presence and identified a few immediate opportunities to increase qualified traffic—especially for customers searching nearby for ${category} services.
    Rather than sending generic suggestions, I’d prefer to walk you through a tailored digital growth plan in a short Google Meet call.

    You can choose a convenient time directly from my calendar:
    ${calendarLink}

    If none of the available slots work, feel free to reply with a preferred time.

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
    If you’re open to it, I’d be happy to discuss these insights over a short Google Meet—no presentations, just a focused discussion.

    You can pick a suitable time here:
    ${calendarLink}

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
    If it’s useful, I’d be happy to share a few general insights relevant to ${category} businesses during a short Google Meet.

    You can book a time that works for you here:
    ${calendarLink}

    Thanks for your time,  
    Anudeep  
    G Connect Solutions
    `;
    }


    // Combine the text body with the HTML buttons for the HTML version
    const htmlBody = `
        <p style="white-space: pre-wrap; font-family: sans-serif;">${textBody.trim()}</p>
        ${replyButtonsHTML}
    `;

    return { subject, textBody, htmlBody };
}

async function sendEmail(lead) {
    if (!lead.email) {
        console.warn(`Skipping email: No email found for ${lead.name}`);
        return;
    }

    // Capture both text and HTML from the generation function
    const { subject, textBody, htmlBody } = generateEmailContent(lead);
    
    const mailOptions = {
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: lead.email,
        subject: subject,
        // Send both TEXT and HTML versions (best practice for compatibility)
        text: textBody.trim(), 
        html: htmlBody,         // <-- The HTML content with buttons
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`\t✅ Email sent to ${lead.email} (${lead.priority_level}). Message ID: ${info.messageId}`);
    } catch (error) {
        console.error(`\t❌ FAILED to send email to ${lead.email}: ${error.message}`);
        lead.status = "EMAIL_FAILED";
    }
    if (lead.status !== "EMAIL_FAILED") {
        lead.status = "SENT_SUCCESS";
    }
}

// ... (Rest of the script continues here, including the main execution flow)
// =========================================================
//             OUTPUT FUNCTIONS
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
//            MAIN EXECUTION FLOW (FULL LOGIC)
// =========================================================

const TEST_EMAIL_RECIPIENT = "anudeep982@gmail.com"; 
const RUN_TEST_MODE = true; // <-- CHANGE THIS TO 'false' FOR FULL LAUNCH

async function runPipelineLogic() {
    try {
        console.log("1. Starting OSM Data Fetch and Initial Processing...");
        const data = await fetchOverpass(query);

        let leads = data.elements
            .filter(el => el.tags && el.tags.name)
            .map(el => ({
                name: el.tags.name || "",
                raw_email: el.tags.email || "",
                raw_website: el.tags.website || "",
                category: el.tags.amenity || el.tags.shop || el.tags.office || "",
                address: 
                    `${el.tags["addr:housenumber"] || ""} ${el.tags["addr:street"] || ""}, ` +
                    `${el.tags["addr:city"] || ""}, ${el.tags["addr:postcode"] || ""}`.trim(),
                email: null, 
                status: "Raw"
            }));

        // --------------------------------------------------------------------------------
        // 🚨 TEST MODE EXECUTION (RUN_TEST_MODE = true)
        // --------------------------------------------------------------------------------
        if (RUN_TEST_MODE) {
            const mockLead = {
                name: leads[0].name || "Anudeep",
                raw_website: leads[0].raw_website || "https://www.gconnectsolutions.com",
                category: leads[0].category || "architect",
                email: TEST_EMAIL_RECIPIENT, // Overridden to YOUR email
                final_score: 15, 
                priority_level: "WARM_LEAD",
                address: leads[0].address || "Indiranagar, Bengaluru",
                status: "Test Ready"
            };

            

            console.log("\n2. Pipeline Test Prepared (HOT LEAD Simulation).");
            console.log("\n-----------------------------------------");
            console.log("| 3. STEP 4: SINGLE EMAIL TEST EXECUTION |");
            console.log("-----------------------------------------");
            
            console.log(`\nAttempting to send a HOT_LEAD test email to: ${TEST_EMAIL_RECIPIENT}`);
            await sendEmail(mockLead); 
            await delay(2000);
            const dashboardData = [{
                Name: mockLead.name,
                Email: mockLead.email || '',
                Website: mockLead.raw_website || '',
                Category: mockLead.category,
                Address: mockLead.address,
                Score: mockLead.final_score || 0,
                Priority: mockLead.priority_level || 'N/A',
                Status: "SENT_SUCCESS" // Set status that frontend can check
            }];

            // 3. CRITICAL: Return the valid data structure
            return dashboardData;
            console.log("\n✅ Test Complete. Check your inbox to verify content and delivery.");
            console.log("--- Set RUN_TEST_MODE = false for the full campaign launch. ---");
            return; 
        }

        // --------------------------------------------------------------------------------
        // 🚀 FULL CAMPAIGN EXECUTION (RUN_TEST_MODE = false)
        // --------------------------------------------------------------------------------
        
        // 2. Deduplicate by name+address
        const seen = new Set();
        const uniqueLeads = leads.filter(r => {
            const key = r.name + r.address;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`\n2. Total unique businesses extracted from OSM: ${uniqueLeads.length}`);
        console.log("3. Starting Data Cleaning and Email Enrichment (Visiting websites)...");
        
        // 3. Validation and Enrichment Loop
        const finalLeads = [];
        for (let i = 0; i < uniqueLeads.length; i++) {
            const lead = uniqueLeads[i];
            
            // A. EMAIL ENRICHMENT (First from OSM tag, then by scraping website)
            lead.email = validator.isEmail(lead.raw_email) ? lead.raw_email : null; 
            if (!lead.email && lead.raw_website) {
                const foundEmail = await findEmail(lead.raw_website);
                if (foundEmail) {
                    lead.email = foundEmail;
                }
            }
            
            // B. FINAL FILTER: Only keep leads with a validated email
            if (lead.email) {
                lead.status = "CLEANED/VALIDATED";
                finalLeads.push(lead);
            }

             if ((i + 1) % 50 === 0) {
                 console.log(`\tProcessed ${i + 1} leads... (${finalLeads.length} qualified)`);
             }
        }
        
        console.log(`\n4. Final clean, validated leads ready for scoring: ${finalLeads.length}`);
        
        // 4. LEAD SCORING
        const scoredLeads = finalLeads.map(lead => scoreLead(lead));
        scoredLeads.sort((a, b) => b.final_score - a.final_score);
        
        const hotCount = scoredLeads.filter(l => l.priority_level === 'HOT_LEAD').length;
        console.log(`\n✅ Scoring Complete: ${hotCount} HOT leads found.`);

        // 5. INITIAL OUTPUT SAVE
        fs.writeFileSync(OUTPUT_CSV, toCSV(scoredLeads));
        saveExcel(scoredLeads);
        console.log("\nInitial output saved. Starting outreach...");

        // 6. AUTOMATED EMAIL OUTREACH (Iterates through ALL leads)
        console.log("\n-----------------------------------------");
        console.log("| 6. STEP 4: AUTOMATED EMAIL OUTREACH   |");
        console.log("-----------------------------------------");

        for (let i = 0; i < scoredLeads.length; i++) {
            const lead = scoredLeads[i];
            
            // Send email to the lead's scraped email address
            await sendEmail(lead); 
            
            // CRITICAL: Pause between sends
            await delay(5000); 

            if ((i + 1) % 10 === 0) {
                console.log(`\n--- Sent ${i + 1} emails. Pausing for 30s to be safe. ---\n`);
                await delay(30000); 
            }
        }

        // 7. FINAL OUTPUT SAVE (Includes SENT status)
        fs.writeFileSync(OUTPUT_CSV, toCSV(scoredLeads));
        saveExcel(scoredLeads);

        console.log("\n🚀 AUTOMATION COMPLETE! All leads have been processed and emails attempted.");

    } catch (err) {
        console.error("❌ Execution failed:", err.message);
        console.error("HINT: If 'Authentication failed', verify the App Password. If 'Overpass' error, reduce the query scope.");
    }
};

app.listen('3001', () => {
    console.log('server running on http//localhost:3001')
})

module.exports = {runPipelineLogic};