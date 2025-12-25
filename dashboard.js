// dashboard.js - Fully fixed: tags with event listeners, safe null checks, no syntax errors

const tableBody = document.getElementById('leads-table-body');
const runButton = document.getElementById('run-button');
const sendAllBtn = document.getElementById('sendAll');
const statusMessage = document.getElementById('status-message');
const BACKEND_URL = 'https://automation.gconnectt.com';

// Safe DOM references
const cityInput = document.getElementById('city-input');
const categoryInput = document.getElementById('category-input');
const cityTagsContainer = document.getElementById('city-tags-container');

// Store selected cities (lowercase for comparison)
let selectedCities = [];

// Function to add a city tag
function addCityTag(cityName) {
  const trimmed = cityName.trim();
  if (!trimmed || selectedCities.includes(trimmed.toLowerCase())) return;

  selectedCities.push(trimmed.toLowerCase());

  if (!cityTagsContainer) return;

  const tag = document.createElement('div');
  tag.className = 'city-tag';
  tag.textContent = trimmed;

  // Create remove button
  const removeBtn = document.createElement('span');
  removeBtn.className = 'remove';
  removeBtn.textContent = ' ×';
  removeBtn.style.cursor = 'pointer';
  removeBtn.style.marginLeft = '6px';
  removeBtn.style.fontWeight = 'bold';

  // Add click listener for removal
  removeBtn.addEventListener('click', () => {
    removeCityTag(trimmed.toLowerCase());
  });

  tag.appendChild(removeBtn);

  // Insert tag before input
  cityTagsContainer.insertBefore(tag, cityInput);

  // Clear input
  if (cityInput) cityInput.value = '';
}

// Function to remove a city tag
function removeCityTag(cityLower) {
  selectedCities = selectedCities.filter(c => c !== cityLower);

  if (!cityTagsContainer) return;

  const tags = cityTagsContainer.querySelectorAll('.city-tag');
  tags.forEach(tag => {
    if (tag.textContent.toLowerCase().includes(cityLower)) {
      tag.remove();
    }
  });
}

// City input events (Enter or comma to add tag)
if (cityInput) {
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const city = cityInput.value.trim();
      if (city) addCityTag(city);
    }
  });

  // Also add on blur (click outside)
  cityInput.addEventListener('blur', () => {
    const city = cityInput.value.trim();
    if (city) addCityTag(city);
  });
}

// Update dashboard table & stats
function updateDashboard(leads) {
  if (!document.getElementById('total-leads')) return;

  const total = leads.length;
  document.getElementById('total-leads').textContent = total;
  document.getElementById('hot-leads').textContent = leads.filter(l => l.Priority === 'HOT_LEAD').length;
  document.getElementById('warm-leads').textContent = leads.filter(l => l.Priority === 'WARM_LEAD').length;
  document.getElementById('cold-leads').textContent = leads.filter(l => l.Priority === 'COLD_LEAD').length;
  document.getElementById('sent-emails').textContent = leads.filter(l => l.Status === 'SENT_SUCCESS').length;

  if (tableBody) {
    tableBody.innerHTML = total ? '' : '<tr><td colspan="7">No leads found.</td></tr>';
    
    leads.forEach(l => {
      const row = document.createElement('tr');
      row.classList.add(l.Priority || 'COLD_LEAD');
      row.innerHTML = `
        <td>${l.Name || 'N/A'}</td>
        <td>${l.Category || 'N/A'}</td>
        <td>${l.Email || 'N/A'}</td>
        <td><a href="${l.Website || '#'}" target="_blank">${l.Website ? l.Website.split('//')[1] || l.Website : 'N/A'}</a></td>
        <td>${l.Score || 'N/A'}</td>
        <td>${l.Priority || 'N/A'}</td>
        <td>${l.Status || 'PENDING'}</td>
      `;
      tableBody.appendChild(row);
    });
  }
}

// Default Bengaluru pipeline
if (runButton) {
  runButton.addEventListener('click', async () => {
    if (statusMessage) statusMessage.textContent = "Scraping Bengaluru leads...";
    runButton.disabled = true;
    try {
      const res = await fetch('/run-pipeline', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      updateDashboard(data);
      localStorage.setItem('scrapedLeads', JSON.stringify(data));
      if (statusMessage) statusMessage.textContent = `Found ${data.length} leads from Bengaluru.`;
    } catch (e) {
      if (statusMessage) statusMessage.textContent = `Error: ${e.message}`;
      console.error(e);
    } finally {
      runButton.disabled = false;
    }
  });
}

// Send all emails
if (sendAllBtn) {
  sendAllBtn.addEventListener('click', async () => {
    if (statusMessage) statusMessage.textContent = "Sending emails...";
    sendAllBtn.disabled = true;
    try {
      await fetch(`${BACKEND_URL}/send-all`, { method: 'POST' });
      const res = await fetch(`${BACKEND_URL}/get-leads`);
      const data = await res.json();
      updateDashboard(data);
      localStorage.setItem('scrapedLeads', JSON.stringify(data));
      if (statusMessage) statusMessage.textContent = "Emails processed!";
    } catch (e) {
      if (statusMessage) statusMessage.textContent = `Send error: ${e.message}`;
      console.error(e);
    } finally {
      sendAllBtn.disabled = false;
    }
  });
}

// Multi-city search using tags
const leadSearchBtn = document.getElementById('leadSearch');
if (leadSearchBtn) {
  leadSearchBtn.addEventListener('click', async () => {
    if (selectedCities.length === 0) {
      if (statusMessage) statusMessage.textContent = "Please add at least one city tag.";
      return;
    }

    const category = categoryInput?.value.trim();
    if (!category) {
      if (statusMessage) statusMessage.textContent = "Please enter a category.";
      return;
    }

    const citiesString = selectedCities.join(', ');
    if (statusMessage) statusMessage.textContent = `Scraping ${citiesString} for ${category}...`;

    try {
      const res = await fetch('/search-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cities: citiesString, category })
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      updateDashboard(data);
      localStorage.setItem('scrapedLeads', JSON.stringify(data));
      if (statusMessage) statusMessage.textContent = `Found ${data.length} leads across selected cities.`;
    } catch (e) {
      if (statusMessage) statusMessage.textContent = `Search failed: ${e.message}`;
      console.error(e);
    }
  });
}

// Lead details navigation
document.getElementById('leadDetails')?.addEventListener('click', () => {
  window.location.href = 'leadDetails.html';
});

// Initial status
if (statusMessage) {
  statusMessage.textContent = "Status: Ready. Add cities as tags and category, then click Search Leads.";
}