const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');

// Add stealth plugin to hide we are a bot
puppeteer.use(StealthPlugin());

// **UPDATED TARGET:** Searching for businesses that NEED digital marketing services.
const SEARCH_QUERY = 'Boutique Hotels in Bangalore, Karnataka, India'; // <-- CHANGE THIS TO YOUR TARGET NICHE
const OUTPUT_FILE = 'leads_stage1_refined.json';
const TIMEOUT_WAIT = 30000; // 30 seconds wait for page elements to load

async function scrapeGoogleMapsRefined() {
    console.log('--- Launching Stealth Browser ---');
    const browser = await puppeteer.launch({ 
    headless: false, 
    args: ['--start-maximized', '--no-sandbox'],
    // Use a clean, temporary user data directory (crucial for clearing cache/history)
    userDataDir: './temp/chrome_profile_clean' 
});
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    // **STEALTH MEASURE 1: Initial Human Delay**
    const initialDelay = Math.floor(Math.random() * 5000) + 3000; // 3 to 8 seconds
    console.log(`Waiting ${initialDelay}ms to simulate human startup...`);
    await new Promise(r => setTimeout(r, initialDelay));
    
    // Navigate to the Google Maps search URL
    const mapUrl = `https://www.google.com/maps/search/louvre+museum+in+paris/?hl=en3{SEARCH_QUERY.split(' ').join('+')}`;
    await page.goto(mapUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // --- STEP 1: SCROLL AND INITIAL EXTRACTION ---
    
    try {
        // **UPDATED TIMEOUT:** Waiting longer for the dynamic element to load
        await page.waitForSelector('div[role="feed"]', { timeout: TIMEOUT_WAIT }); 
    } catch (e) {
        console.error("⛔ STOPPED: Could not find result list. You must manually solve any CAPTCHA/Verify page and restart.");
        await browser.close();
        return;
    }
    
    console.log('--- Scrolling to load all dynamic data... ---');
    await autoScroll(page);

    // Extract Data from the sidebar (basic name and map link)
    const leads = await page.evaluate(() => { 
        const data = [];
        const items = document.querySelectorAll('.hfpxzc'); // Selector for main listing link

        items.forEach(item => {
            const link = item.getAttribute('href');
            const name = item.getAttribute('aria-label');
            
            if (name && link) {
                data.push({
                    name: name,
                    mapLink: link,
                    websiteUrl: null, 
                    phoneNumber: null
                });
            }
        });
        return data;
    });

    // --- STEP 2: THE DEEP DIVE LOOP (Visit each business profile) ---

    let refinedLeads = [];
    console.log(`\n--- Starting Deep Dive on ${leads.length} leads (This is slow and risky, ~5-10s per lead) ---`);

    for (const lead of leads) {
        if (!lead.mapLink) continue;

        try {
            // Navigate to the business's dedicated profile page
            await page.goto(lead.mapLink, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_WAIT });

            // CRITICAL: Wait for the profile page to load and find the "Website" or "Phone" button
            await page.waitForSelector('a[data-tooltip="Website"], button[data-tooltip^="Copy phone number"]', { timeout: 15000 }); 
            
            // Extract website and phone number from the dedicated profile page
            const deepData = await page.evaluate(() => {
                // Selector for the website button 
                const websiteButton = document.querySelector('a[data-tooltip="Website"]'); 
                const websiteUrl = websiteButton ? websiteButton.getAttribute('href') : null;
                
                // Selector for the phone number button
                const phoneButton = document.querySelector('button[data-tooltip^="Copy phone number"]'); 
                const phoneNumber = phoneButton ? phoneButton.getAttribute('aria-label').replace('Copy phone number ', '') : null;
                
                return { websiteUrl, phoneNumber };
            });

            // Update the lead object
            lead.websiteUrl = deepData.websiteUrl;
            lead.phoneNumber = deepData.phoneNumber;

            refinedLeads.push(lead);
            console.log(`✅ Refined ${lead.name}: Website found: ${lead.websiteUrl || 'No Website'}`);

            // **STEALTH MEASURE 2: Random Loop Delay**
            const loopDelay = Math.floor(Math.random() * 5000) + 5000; // 5 to 10 second delay
            await new Promise(r => setTimeout(r, loopDelay));

        } catch (e) {
            console.error(`❌ Failed to deep dive into ${lead.name}: ${e.message.substring(0, 50)}...`);
            refinedLeads.push(lead); // Keep the entry even if failed
        }
    }

    // --- STEP 3: FINAL OUTPUT ---

    await fs.writeJson(OUTPUT_FILE, refinedLeads, { spaces: 2 });
    console.log(`\n🎉 STAGE 1 REFINED COMPLETE. Data saved to ${OUTPUT_FILE}`);
    await browser.close();
}

// Helper function to handle the Google Maps infinite scroll
async function autoScroll(page) {
    const wrapperSelector = 'div[role="feed"]'; // The scrollable sidebar container
    await page.waitForSelector(wrapperSelector);

    await page.evaluate(async (selector) => {
        const wrapper = document.querySelector(selector);
        let previousHeight = 0;
        let scrollCount = 0;
        
        while (scrollCount < 15) { 
            wrapper.scrollBy(0, 5000); 
            await new Promise(resolve => setTimeout(resolve, 2000)); 

            let newHeight = wrapper.scrollHeight;
            if (newHeight === previousHeight) {
                // We've hit the bottom of the list
                break;
            }
            previousHeight = newHeight;
            scrollCount++;
        }
    }, wrapperSelector);
}

scrapeGoogleMapsRefined();