// frontend.js

const tableBody = document.getElementById('leads-table-body');
const runButton = document.getElementById('run-button');
const statusMessage = document.getElementById('status-message');

/**
 * Executes the API call to start the Node.js backend pipeline.
 */
async function runPipeline() {
    runButton.disabled = true;
    statusMessage.textContent = "Status: Pipeline running... This may take several minutes to complete all scraping and emailing.";
    tableBody.innerHTML = '<tr><td colspan="7">Running pipeline... Please wait.</td></tr>';

    try {
        // --- API Call to Backend ---
        // The URL '/run-pipeline' is relative and points to the endpoint in your app.js
        const response = await fetch('/run-pipeline', { 
            method: 'POST' 
        });
        // ---------------------------
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}. Status: ${response.status}`);
        }
        
        // The backend (app.js) sends back the leads data as JSON
        const leads = await response.json();
        
        // 1. Update Dashboard Stats
        const totalLeads = leads.length;
        const hotLeads = leads.filter(l => l.Priority === 'HOT_LEAD').length;
        const sentEmails = leads.filter(l => l.Status === 'SENT_SUCCESS').length;

        document.getElementById('total-leads').textContent = totalLeads;
        document.getElementById('hot-leads').textContent = hotLeads;
        document.getElementById('sent-emails').textContent = sentEmails;

        // 2. Update Table
        tableBody.innerHTML = '';
        leads.forEach(lead => {
            const row = document.createElement('tr');
            row.classList.add(lead.Priority); // Use the priority level for styling
            row.innerHTML = `
                <td>${lead.Name}</td>
                <td>${lead.Category}</td>
                <td>${lead.Email}</td>
                <td><a href="${lead.Website}" target="_blank">${lead.Website.split('//')[1] || lead.Website}</a></td>
                <td>${lead.Score}</td>
                <td>${lead.Priority}</td>
                <td>${lead.Status}</td>
            `;
            tableBody.appendChild(row);
        });
        statusMessage.textContent = `Status: Pipeline complete! ${sentEmails} emails were attempted.`;

    } catch (error) {
        console.error("Frontend Error:", error);
        statusMessage.textContent = `Status: ERROR! ${error.message}. Check the server console.`;
        tableBody.innerHTML = '<tr><td colspan="7">Failed to load data. Check server and browser console.</td></tr>';
    } finally {
        runButton.disabled = false;
    }
}

// Attach the function to the button click event
runButton.addEventListener('click', runPipeline);

// Initial status message
statusMessage.textContent = "Status: Ready. Click the button to start the process.";