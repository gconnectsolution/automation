const axios = require("axios");
const fs = require("fs");
const XLSX = require("xlsx");
const cheerio = require("cheerio");
const validator = require("validator");
const nodemailer = require("nodemailer");
const mongoose = require('mongoose');
const dotEnv = require('dotenv');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const express = require('express');
const app = express();
const UserModel = require('./model/UserModel');

// Load env
dotEnv.config();

// MongoDB
mongoose.connect(process.env.mongo_uri)
  .then(() => console.log('mongoDB connected successfully'))
  .catch(e => console.error('mongoDB connection failed:', e.message));

// Globals
let currentLeads = [];
const OUTPUT_CSV = "leads_scored.csv";
const OUTPUT_XLSX = "leads_scored.xlsx";
const SENDER_EMAIL = 'gconnectsolution@gmail.com';
const SENDER_PASS = 'zwtz tczh yzuh yopp';
const SENDER_NAME = '[Ramya T N/G Connect Solutions]';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SENDER_EMAIL, pass: SENDER_PASS },
    pool: true,
    maxMessages: 100,
    maxConnections: 10
});

// Middleware
app.use(cors({ origin: 'https://automation.gconnectt.com' }));
app.use(express.json());
app.use('/user', userRoutes);

console.log("DEBUG: Middleware set up");

// Utilities
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",           // Start with this (worked)
  "https://z.overpass-api.de/api/interpreter",               // Stable German
  "https://api.openstreetmap.fr/oapi/interpreter",
  "https://overpass.openstreetmap.ie/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

async function fetchOverpass(query, retries = 6) {
  for (const url of OVERPASS_URLS) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Fetching ${url} (attempt ${i+1})...`);
        const res = await axios.post(url, query, {
          headers: { "Content-Type": "text/plain" },
          timeout: 180000
        });
        if (res.data?.elements?.length > 0) return res.data;
      } catch (err) {
        console.warn(`Failed ${url}: ${err.message}`);
        await delay(15000);
      }
    }
  }
  throw new Error("All Overpass mirrors failed.");
}

async function findEmail(url) {
  if (!url || !url.startsWith('http')) return null;
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0 (LeadGenApp/1.0)' }
    });
    const matches = res.data.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
    if (matches) {
      const unique = [...new Set(matches.map(e => e.toLowerCase().trim()))];
      return unique.find(e => validator.isEmail(e)) || null;
    }
  } catch {}
  return null;
}

function scoreLead(lead) {
  let score = 0;
  const name = lead.name?.toLowerCase() || '';
  const cat = lead.category?.toLowerCase() || '';
  const generic = ['info', 'contact', 'support', 'sales', 'admin'];
  const isGeneric = lead.email && generic.some(p => lead.email.toLowerCase().startsWith(p));

  if (cat.includes('architect') || cat.includes('real_estate')) score += 15;
  else if (cat.includes('restaurant') || cat.includes('cafe') || cat.includes('gym')) score += 10;

  if (name.includes('group') || name.includes('pvt') || name.includes('corp') || name.includes('ltd')) score += 10;
  if (lead.email) score += isGeneric ? -5 : 5;

  lead.final_score = Math.max(0, score);
  lead.priority_level = score >= 25 ? "HOT_LEAD" : score >= 10 ? "WARM_LEAD" : "COLD_LEAD";
  return lead;
}

function getFirstName(name) {
  if (!name) return "Team";
  let clean = name.replace(/pvt|ltd|group|corp|est|&|and|'s/gi, '').trim();
  const parts = clean.split(/\s+/);
  return (parts[0]?.length > 2 && parts[0].length < 10) ? parts[0] : "Team";
}

function generateEmailContent(lead) {
  const name = getFirstName(lead.name);
  const biz = lead.name;
  const web = lead.raw_website;
  const cat = lead.category;
  const sender = SENDER_EMAIL;

  let subject = '', body = '';
  const base = "https://automation.gconnectt.com/user/interested";
  const yesLink = `${base}?email=${encodeURIComponent(lead.email)}&name=${encodeURIComponent(lead.name)}&category=${encodeURIComponent(cat)}`;
  const noLink = `mailto:${sender}?subject=${encodeURIComponent(`Re: ${biz} - Local Strategy`)}&body=Thanks, but not interested.`;

  const btnStyle = "display:inline-block;padding:12px 25px;margin:10px 5px;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold;text-align:center;";
  const buttons = `
    <div style="margin-top:20px;">
      <a href="${yesLink}" style="${btnStyle}background:#4CAF50;">Yes, I'm Interested</a>
      <a href="${noLink}" style="${btnStyle}background:#f44336;">No, Not Interested</a>
    </div>
  `;

  if (lead.priority_level === 'HOT_LEAD') {
    subject = `Growth Plan for ${biz} — Quick Meet?`;
    body = `Hi ${name},\nWe help businesses like ${biz} get more customers.\nFound opportunities for ${cat}.\nLet’s discuss.\nClick below:\nBest,\nRamya T N`;
  } else if (lead.priority_level === 'WARM_LEAD') {
    subject = `Review your ${cat} visibility?`;
    body = `Hello ${name},\nSaw quick wins for ${biz} (${web}).\nHappy to share.\nClick below:\nRegards,\nRamya T N`;
  } else {
    subject = `Idea for ${biz}`;
    body = `Hi ${name},\nTips for ${cat} businesses available.\nClick below:\nThanks,\nRamya T N`;
  }

  return { subject, textBody: body, htmlBody: `<p style="white-space:pre-wrap;">${body}</p>${buttons}` };
}

async function sendEmail(lead) {
  if (!lead.email) {
    lead.status = "NO_EMAIL";
    return;
  }
  const { subject, textBody, htmlBody } = generateEmailContent(lead);
  try {
    await transporter.sendMail({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: lead.email,
      subject,
      text: textBody,
      html: htmlBody
    });
    console.log(`✅ Sent to ${lead.email}`);
    lead.status = "SENT_SUCCESS";
  } catch (e) {
    console.error(`❌ Failed ${lead.email}: ${e.message}`);
    lead.status = "EMAIL_FAILED";
  }
}

// Output functions (moved up)
function toCSV(rows) {
  const header = "name,email,website,category,address,final_score,priority_level,status\n";
  const lines = rows.map(r =>
    `"${r.name?.replace(/"/g, '""') || ''}","${r.email || ''}","${r.raw_website || ''}","${r.category || ''}","${r.address?.replace(/"/g, '""') || ''}",${r.final_score || 0},"${r.priority_level || 'N/A'}","${r.status || ''}"`
  );
  return header + lines.join("\n");
}

function saveExcel(data) {
  const cleanData = data.map(r => ({
    Name: r.name || '',
    Email: r.email || '',
    Website: r.raw_website || '',
    Category: r.category || '',
    Address: r.address || '',
    Score: r.final_score || 0,
    Priority: r.priority_level || 'N/A',
    Status: r.status || ''
  }));
  const worksheet = XLSX.utils.json_to_sheet(cleanData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Scored Leads");
  XLSX.writeFile(workbook, OUTPUT_XLSX);
  console.log("✅ Excel saved →", OUTPUT_XLSX);
}

// Routes
app.get('/user/interested', async (req, res) => {
  const { email, name, category } = req.query;
  if (!email) return res.status(400).send("Email missing.");
  try {
    await UserModel.findOneAndUpdate(
      { email: email.toLowerCase() },
      { name: decodeURIComponent(name), category: decodeURIComponent(category), status: "INTERESTED", clickedAt: new Date() },
      { upsert: true, new: true }
    );
    res.redirect("https://calendar.app.google/mepp8MDWBPF24WQ28");
  } catch (e) {
    res.status(500).send("Error.");
  }
});

app.post('/send-all', async (req, res) => {
  let count = 0;
  for (let l of currentLeads) {
    if (l.status === 'PENDING') {
      await sendEmail(l);
      count++;
      await delay(5000);
    }
  }
  res.json({ success: true, sent: count });
});

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

// Pipeline (Bengaluru default)
const TEST_EMAIL = "anudeep982@gmail.com";
const TEST_MODE = true;

async function runPipelineLogic() {
  try {
    const data = await fetchOverpass(query);
    if (!data?.elements?.length) throw new Error("No data");

    let leads = data.elements
      .filter(e => e.tags?.name)
      .map(e => ({
        name: e.tags.name,
        raw_website: e.tags.website || "",
        raw_email: e.tags.email || "",
        category: e.tags.amenity || e.tags.shop || "Business",
        address: e.tags["addr:street"] || "Bengaluru",
        email: null
      }));

    if (TEST_MODE) {
      const mock = {
        name: leads[0]?.name || "Anudeep",
        raw_website: "https://gconnectsolutions.com",
        category: "Architect",
        email: TEST_EMAIL,
        final_score: 25,
        priority_level: "HOT_LEAD",
        status: "PENDING"
      };
      currentLeads = [mock];
      return [{ Name: mock.name, Category: mock.category, Email: mock.email, Website: mock.raw_website, Score: mock.final_score, Priority: mock.priority_level, Status: mock.status }];
    }

    const seen = new Set();
    const unique = leads.filter(l => {
      const key = (l.name + l.address).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const final = [];
    for (let l of unique) {
      l.email = validator.isEmail(l.raw_email) ? l.raw_email : await findEmail(l.raw_website);
      if (l.email) {
        const s = scoreLead(l);
        s.status = "PENDING";
        final.push(s);
        await delay(1000);
      }
    }

    currentLeads = final;
    fs.writeFileSync(OUTPUT_CSV, toCSV(final));
    saveExcel(final);

    return final.map(l => ({ Name: l.name, Category: l.category, Email: l.email, Website: l.raw_website, Score: l.final_score, Priority: l.priority_level, Status: l.status }));
  } catch (e) {
    console.error("Pipeline error:", e.message);
    throw e;
  }
}

// Multi-city search with auto-correct
// Multi-city search with auto-correct and broader gym/restaurant query
async function runSearchLogic(citiesInput, category) {
  try {
    console.log(`Multi-city search: "${citiesInput}", category: "${category}"`);

    // Split cities
    let cities = citiesInput.split(',').map(c => c.trim()).filter(c => c);

    // Auto-correct old names & misspellings (expanded for India)
    const cityMap = {
      'bombay': 'mumbai',
      'calcutta': 'kolkata',
      'madras': 'chennai',
      'bangalore': 'bengaluru',
      'banglore': 'bengaluru',
      'bangaluru': 'bengaluru',
      'vishakapatnam': 'visakhapatnam',
      'vizag': 'visakhapatnam',
      'goa': 'panaji',             // Capital + better coverage
      'kerala': 'kochi',           // Commercial hub → more gyms/restaurants tagged
      'thiruvananthapuram': 'thiruvananthapuram',
      'trivandrum': 'thiruvananthapuram'
    };

    cities = cities.map(c => {
      const lower = c.toLowerCase();
      return cityMap[lower] || lower; // corrected or original
    });

    console.log(`Processed cities:`, cities);

    let allResults = [];

    for (const city of cities) {
      console.log(`Scraping ${city}...`);
      try {
        // Step 1: Get area ID from Nominatim
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`;
        const cityRes = await axios.get(nominatimUrl, {
          headers: { 'User-Agent': 'LeadGenApp/1.0 (gconnectsolution@gmail.com)' },
          timeout: 10000
        });

        if (!cityRes.data?.length) {
          console.warn(`City "${city}" not found in Nominatim`);
          continue;
        }

        const areaId = cityRes.data[0].osm_id + 3600000000;

        // Step 2: Broader query for gyms (and restaurants if category matches)
        let amenityRegex = category.toLowerCase();
        if (amenityRegex === 'gym') {
          amenityRegex = 'gym|fitness_centre|fitness center|sports_centre|sports hall|health club';
        } else if (amenityRegex.includes('restaurant')) {
          amenityRegex = 'restaurant|cafe|fast_food|bar|pub';
        }

        const dynamicQuery = `
          [out:json][timeout:180];
          area(${areaId})->.searchArea;
          (
            nwr["amenity"~"${amenityRegex}",i](area.searchArea);
            nwr["leisure"~"${amenityRegex}",i](area.searchArea);
            nwr["building"~"${amenityRegex}",i](area.searchArea);
            nwr["sport"~"${amenityRegex}",i](area.searchArea);
            nwr[name~"${category}",i](area.searchArea);
            nwr["shop"~"${category}",i](area.searchArea);
          );
          out body;
          >;
          out skel qt;
        `;

        const data = await fetchOverpass(dynamicQuery);

        let leads = data.elements
          .filter(el => el.tags?.name)
          .map(el => ({
            name: el.tags.name,
            raw_website: el.tags.website || "",
            raw_email: el.tags.email || "",
            category: el.tags.amenity || el.tags.shop || el.tags.office || category,
            address: el.tags["addr:street"] ? `${el.tags["addr:street"]}, ${city}` : city,
            email: null
          }));

        const seen = new Set();
        const uniqueLeads = leads.filter(r => {
          const key = (r.name + r.address).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        for (let lead of uniqueLeads) {
          lead.email = validator.isEmail(lead.raw_email) ? lead.raw_email : await findEmail(lead.raw_website);
          if (lead.email) {
            const scored = scoreLead(lead);
            scored.status = "PENDING";
            allResults.push(scored);
            await delay(500);
          }
        }

        console.log(`Found ${uniqueLeads.length} unique places in ${city}, ${allResults.length} with emails so far`);

      } catch (e) {
        console.warn(`Error scraping ${city}: ${e.message}`);
      }
    }

    if (!allResults.length) {
      throw new Error("No leads found in any city. Try a broader category like 'restaurant' or check if OSM has data for that area.");
    }

    currentLeads = allResults;
    fs.writeFileSync(OUTPUT_CSV, toCSV(allResults));
    saveExcel(allResults);

    return allResults.map(l => ({
      Name: l.name,
      Category: l.category,
      Email: l.email,
      Website: l.raw_website,
      Score: l.final_score,
      Priority: l.priority_level,
      Status: l.status,
      Address: l.address
    }));

  } catch (err) {
    console.error("Multi-city Search Error:", err.message);
    throw err;
  }
}

// Server start
console.log("DEBUG: Starting server on 3001...");
app.listen(3001, () => console.log('Server running on https://automation.gconnectt.com'));

module.exports = { runPipelineLogic, runSearchLogic };