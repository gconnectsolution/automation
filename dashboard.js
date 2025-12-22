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
    document.getElementById('warm-leads').textContent = warm;  // Fixed: was missing
    document.getElementById('cold-leads').textContent = cold;  // Fixed: was missing
    document.getElementById('sent-emails').textContent = sent;

    // Update Table
    tableBody.innerHTML = '';
    if (leads.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">No leads available.</td></tr>';
        return;
    }
    leads.forEach(lead => {
        const row = document.createElement('tr');
        row.classList.add(lead.Priority); // Matches CSS classes like .HOT_LEAD
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
 * Note: /run-pipeline is on port 3000, so relative URL is fine.
 */
async function runPipeline() {
    runButton.disabled = true;
    statusMessage.textContent = "Status: Scraping leads... This may take several minutes.";
    tableBody.innerHTML = '<tr><td colspan="7">Scraping leads... Please wait.</td></tr>';
    try {
        const response = await fetch('/run-pipeline', {  // Relative: hits port 3000, which calls the function
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}. Status: ${response.status}`);
        }
        const leads = await response.json();
        updateDashboard(leads);
        statusMessage.textContent = `Status: Scraping complete! Found ${leads.length} leads. Click "Send All" to send emails.`;
    } catch (error) {
        console.error("Frontend Pipeline Error:", error);  // Better logging
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
        const response = await fetch(`${BACKEND_URL}/send-all`, {  // Absolute: hits port 3001
            method: 'POST'
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Send failed');
        }
        const result = await response.json();
        // Refresh leads from backend
        const leadsRes = await fetch(`${BACKEND_URL}/get-leads`);  // Absolute: hits port 3001
        if (!leadsRes.ok) throw new Error('Failed to refresh leads');
        const leads = await leadsRes.json();
        updateDashboard(leads);
        statusMessage.textContent = `Status: Emails sent! ${result.sent || 0} emails processed.`;
    } catch (error) {
        console.error("Frontend Send Error:", error);  // Better logging
        statusMessage.textContent = `Status: ERROR sending emails! ${error.message}`;
    } finally {
        sendAllBtn.disabled = false;
        sendAllBtn.textContent = 'Send All';
    }
}

// Event Listeners
runButton.addEventListener('click', runPipeline);
sendAllBtn.addEventListener('click', sendAllEmails);

// Initial status
statusMessage.textContent = "Status: Ready. Click 'Run Lead Generation & Outreach (Full Pipeline)' to scrape leads, then 'Send All' to email.";

document.getElementById('leadDetails').addEventListener('click', () => {
    window.location.href = ('leadDetails.html');
})

document.getElementById('leadSearch').addEventListener('click', async () => {
    const cityValue = document.getElementById('city-input').value;
    const categoryValue = document.getElementById('category-input').value;

    statusMessage.textContent = `Status: Searching for ${categoryValue} in ${cityValue}...`;

    try {
        const response = await fetch('/search-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                city: cityValue,
                category: categoryValue
            })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }

        const data = await response.json();
        
        // 1. Update the table on the current page
        updateDashboard(data);

        // 2. Save to "Shared Locker" for the Lead Details page
        localStorage.setItem('scrapedLeads', JSON.stringify(data));

        statusMessage.textContent = `Status: Searching complete! Found ${data.length} leads.`;
    } catch (e) {
        console.error("Search Error:", e);
        statusMessage.textContent = "Status: Search failed.";
    }
});