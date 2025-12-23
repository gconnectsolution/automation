// dashboard.js
const tableBody = document.getElementById('leads-table-body');
const runButton = document.getElementById('run-button');
const sendAllBtn = document.getElementById('sendAll');
const statusMessage = document.getElementById('status-message');
const BACKEND_URL = 'http://localhost:3001';  // Absolute URLs for backend

/**
 * Updates stats and table with leads data.
 */
function updateDashboard(leads) {
    // Update Stats (added warm/cold as per HTML)
    const total = leads.length;
    const hot = leads.filter(l => l.Priority === 'HOT_LEAD').length;
    const warm = leads.filter(l => l.Priority === 'WARM_LEAD').length;
    const cold = leads.filter(l => l.Priority === 'COLD_LEAD').length;
    const sent = leads.filter(l => l.Status === 'SENT_SUCCESS').length;

    document.getElementById('total-leads').textContent = total;
    document.getElementById('hot-leads').textContent = hot;
    document.getElementById('warm-leads').textContent = warm;
    document.getElementById('cold-leads').textContent = cold;
    document.getElementById('sent-emails').textContent = sent;

    // Update Table
    tableBody.innerHTML = '';
    if (leads.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">No leads available.</td></tr>';
        return;
    }
    leads.forEach(lead => {
        const row = document.createElement('tr');
        row.classList.add(lead.Priority);
        const websiteDisplay = lead.Website ? (lead.Website.split('//')[1] || lead.Website) : 'N/A';
        const websiteHref = lead.Website ? `href="${lead.Website}" target="_blank"` : '';
        const websiteStyle = !lead.Website ? 'style="color: gray;"' : '';
        row.innerHTML = `
            <td>${lead.Name}</td>
            <td>${lead.Category}</td>
            <td>${lead.Email}</td>
            <td><a ${websiteHref} ${websiteStyle}>${websiteDisplay}</a></td>
            <td>${lead.Score}</td>
            <td>${lead.Priority}</td>
            <td>${lead.Status}</td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * Executes the API call to start the Node.js backend pipeline (scrape only).
 */
async function runPipeline() {
    runButton.disabled = true;
    statusMessage.textContent = "Status: Scraping leads... This may take several minutes.";
    tableBody.innerHTML = '<tr><td colspan="7">Scraping leads... Please wait.</td></tr>';
    try {
        const response = await fetch('/run-pipeline', {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}. Status: ${response.status}`);
        }
        const leads = await response.json();
        updateDashboard(leads);
        
        // Save to localStorage for leadDetails.html
        localStorage.setItem('scrapedLeads', JSON.stringify(leads));
        console.log(`DEBUG: Saved ${leads.length} leads to localStorage from pipeline:`, leads);
        
        statusMessage.textContent = `Status: Scraping complete! Found ${leads.length} leads. Click "Send All" to send emails.`;
    } catch (error) {
        console.error("Frontend Pipeline Error:", error);
        statusMessage.textContent = `Status: ERROR! ${error.message}. Check the server console.`;
        tableBody.innerHTML = '<tr><td colspan="7">Failed to load data. Check server and browser console.</td></tr>';
    } finally {
        runButton.disabled = false;
    }
}

/**
 * Sends emails to all pending leads.
 */
async function sendAllEmails() {
    sendAllBtn.disabled = true;
    sendAllBtn.textContent = 'Sending...';
    statusMessage.textContent = "Status: Sending emails... This may take several minutes.";
    try {
        const response = await fetch(`${BACKEND_URL}/send-all`, {
            method: 'POST'
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Send failed');
        }
        const result = await response.json();
        // Refresh leads from backend
        const leadsRes = await fetch(`${BACKEND_URL}/get-leads`);
        if (!leadsRes.ok) throw new Error('Failed to refresh leads');
        const leads = await leadsRes.json();
        updateDashboard(leads);
        
        // Re-save updated statuses to localStorage
        localStorage.setItem('scrapedLeads', JSON.stringify(leads));
        console.log(`DEBUG: Re-saved ${leads.length} leads to localStorage after send:`, leads);
        
        statusMessage.textContent = `Status: Emails sent! ${result.sent || 0} emails processed.`;
    } catch (error) {
        console.error("Frontend Send Error:", error);
        statusMessage.textContent = `Status: ERROR sending emails! ${error.message}`;
    } finally {
        sendAllBtn.disabled = false;
        sendAllBtn.textContent = 'Send All';
    }
}

// Event Listeners
runButton.addEventListener('click', runPipeline);
sendAllBtn.addEventListener('click', sendAllEmails);

// New: Lead Details Navigation (assumes #leadDetails button in HTML)
const leadDetailsBtn = document.getElementById('leadDetails');
if (leadDetailsBtn) {
    leadDetailsBtn.addEventListener('click', () => {
        window.location.href = 'leadDetails.html';
    });
}

// FIXED: Custom Search by City/Category – Added better error handling and logs
const leadSearchBtn = document.getElementById('leadSearch');
if (leadSearchBtn) {
    leadSearchBtn.addEventListener('click', async () => {
        const cityInput = document.getElementById('city-input');
        const categoryInput = document.getElementById('category-input');
        if (!cityInput || !categoryInput) {
            statusMessage.textContent = "Status: ERROR! City or category input missing in HTML. Add #city-input and #category-input.";
            console.error("DEBUG: Search inputs not found in DOM");
            return;
        }
        const cityValue = cityInput.value.trim();
        const categoryValue = categoryInput.value.trim();
        if (!cityValue || !categoryValue) {
            statusMessage.textContent = "Status: ERROR! Enter city and category.";
            return;
        }

        console.log(`DEBUG: Starting search for city: "${cityValue}", category: "${categoryValue}"`);  // Log start

        statusMessage.textContent = `Status: Searching for ${categoryValue} in ${cityValue}...`;

        try {
            const response = await fetch('/search-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ city: cityValue, category: categoryValue })
            });

            console.log(`DEBUG: Search response status: ${response.status}`);  // Log response

            if (!response.ok) {
                const errText = await response.text();  // Get full error body
                throw new Error(`Server error: ${response.statusText} - ${errText}`);
            }

            const data = await response.json();
            console.log(`DEBUG: Search returned ${data.length} leads:`, data);  // Log data
            
            // Update table
            updateDashboard(data);

            // Save to localStorage for leadDetails.html
            localStorage.setItem('scrapedLeads', JSON.stringify(data));
            console.log(`DEBUG: Saved ${data.length} leads to localStorage from search`);

            statusMessage.textContent = `Status: Search complete! Found ${data.length} leads.`;
        } catch (e) {
            console.error("Search Error:", e);
            statusMessage.textContent = `Status: Search failed! ${e.message}. Check console for details.`;
        }
    });
}

// Initial status
statusMessage.textContent = "Status: Ready. Click 'Run Lead Generation' to scrape leads, then 'Send All' to email.";