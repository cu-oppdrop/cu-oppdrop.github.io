let opportunities = [];
let activeFilters = { level: [], citizenship: [], type: [], field: [], status: ['open'] };
let currentSort = 'deadline';

// Helper to get opportunity status (open or closed)
function getOpportunityStatus(opp) {
  const deadline = parseDeadline(opp);

  // Check for explicit "Closed" status from scraper
  if (opp.deadline_display === 'Closed') {
    return 'closed';
  }

  // Check if past deadline
  if (deadline && getDaysUntil(deadline) < 0) {
    return 'closed';
  }

  // Otherwise it's open (or no date info = assume open)
  return 'open';
}

// Dropdown management
function setupDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
    const trigger = dropdown.querySelector('.filter-trigger');
    const menu = dropdown.querySelector('.filter-menu');
    const filter = dropdown.dataset.filter;

    // Initialize trigger state for pre-selected filters (like status)
    updateTriggerState(dropdown);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close other dropdowns
      document.querySelectorAll('.filter-dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
    });

    menu.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent dropdown from closing when clicking options
      const option = e.target.closest('.filter-option');
      if (!option) return;

      const value = option.dataset.value;

      option.classList.toggle('selected');

      if (option.classList.contains('selected')) {
        activeFilters[filter].push(value);
      } else {
        activeFilters[filter] = activeFilters[filter].filter(v => v !== value);
      }

      updateTriggerState(dropdown);
      render();
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.filter-dropdown.open').forEach(d => {
      d.classList.remove('open');
    });
  });
}

function updateTriggerState(dropdown) {
  const filter = dropdown.dataset.filter;
  const trigger = dropdown.querySelector('.filter-trigger');
  const label = trigger.querySelector('.filter-label');
  const count = activeFilters[filter].length;

  if (count > 0) {
    trigger.classList.add('has-selection');
    label.textContent = `${filter.charAt(0).toUpperCase() + filter.slice(1)} (${count})`;
  } else {
    trigger.classList.remove('has-selection');
    label.textContent = filter.charAt(0).toUpperCase() + filter.slice(1);
  }
}

function buildFieldFilters() {
  const fields = new Set();
  opportunities.forEach(opp => {
    (opp.tags?.field || []).forEach(f => fields.add(f));
  });

  const menu = document.getElementById('fieldMenu');
  const sorted = Array.from(fields).sort();

  if (sorted.length === 0) {
    document.getElementById('fieldDropdown').style.display = 'none';
    return;
  }

  sorted.forEach(field => {
    const option = document.createElement('div');
    option.className = 'filter-option';
    option.dataset.value = field;
    option.innerHTML = `
      <span class="check">✓</span>
      <span>${field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
    `;
    menu.appendChild(option);
  });
}

function parseDeadline(opp) {
  if (opp.deadline) {
    const d = new Date(opp.deadline + 'T00:00:00');
    if (!isNaN(d)) return d;
  }
  if (opp.deadline_display) {
    const d = new Date(opp.deadline_display);
    if (!isNaN(d)) return d;
  }
  return null;
}

function getDaysUntil(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function getRelativeTime(daysUntil) {
  if (daysUntil < 0) return null;
  if (daysUntil === 0) return { text: 'Due today', className: 'deadline-urgent' };
  if (daysUntil === 1) return { text: 'Due tomorrow', className: 'deadline-urgent' };
  if (daysUntil <= 7) return { text: `${daysUntil} days left`, className: 'deadline-urgent' };
  if (daysUntil <= 30) return { text: `${daysUntil} days left`, className: 'deadline-soon' };
  if (daysUntil <= 60) return { text: `${Math.floor(daysUntil / 7)} weeks left`, className: '' };
  return { text: '', className: '' };
}

async function loadData() {
  try {
    const res = await fetch('opportunities.json');
    opportunities = await res.json();
    buildFieldFilters();
    setupDropdowns();
    updateStats();
    render();

    if (opportunities.length > 0) {
      const latest = opportunities.reduce((a, b) =>
        new Date(a.scraped_at) > new Date(b.scraped_at) ? a : b
      );
      const date = new Date(latest.scraped_at);
      document.getElementById('lastUpdated').textContent =
        `Last updated: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }
  } catch (e) {
    document.getElementById('cards').innerHTML =
      '<p class="no-results">Error loading opportunities. Try refreshing.</p>';
  }
}

function updateStats() {
  const filtered = getFiltered();
  const open = opportunities.filter(o => getOpportunityStatus(o) === 'open').length;
  const closed = opportunities.filter(o => getOpportunityStatus(o) === 'closed').length;

  let statsText = `${filtered.length}/${opportunities.length} opportunities`;
  if (activeFilters.status.includes('closed')) {
    statsText += ` (${open} open, ${closed} closed)`;
  }
  document.getElementById('stats').textContent = statsText;
}

function getFiltered() {
  const query = document.getElementById('search').value.toLowerCase();

  let filtered = opportunities.filter(opp => {
    // Status filtering
    const status = getOpportunityStatus(opp);
    if (activeFilters.status.length > 0 && !activeFilters.status.includes(status)) {
      return false;
    }

    if (query) {
      const text = `${opp.name} ${opp.description} ${opp.source}`.toLowerCase();
      if (!text.includes(query)) return false;
    }

    for (const [category, values] of Object.entries(activeFilters)) {
      if (category === 'status') continue; // Already handled above
      if (values.length === 0) continue;
      const oppTags = opp.tags?.[category] || [];
      if (!values.some(v => oppTags.includes(v))) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    switch (currentSort) {
      case 'deadline':
        // Closed opportunities go to the end
        const aStatus = getOpportunityStatus(a);
        const bStatus = getOpportunityStatus(b);
        if (aStatus === 'closed' && bStatus !== 'closed') return 1;
        if (bStatus === 'closed' && aStatus !== 'closed') return -1;

        const aDate = parseDeadline(a);
        const bDate = parseDeadline(b);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate - bDate;

      case 'deadline-desc':
        const aDateDesc = parseDeadline(a);
        const bDateDesc = parseDeadline(b);
        if (!aDateDesc && !bDateDesc) return 0;
        if (!aDateDesc) return 1;
        if (!bDateDesc) return -1;
        return bDateDesc - aDateDesc;

      case 'name':
        return a.name.localeCompare(b.name);

      case 'recent':
        return new Date(b.scraped_at) - new Date(a.scraped_at);

      default:
        return 0;
    }
  });

  return filtered;
}

function render() {
  const filtered = getFiltered();
  const container = document.getElementById('cards');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="no-results">No opportunities match your filters.</p>';
    updateStats();
    return;
  }

  container.innerHTML = filtered.map(opp => {
    const tags = [];
    for (const [cat, values] of Object.entries(opp.tags || {})) {
      if (cat === 'funding') {
        values.forEach(v => tags.push(`<span class="tag tag-funding">${v}</span>`));
      } else {
        values.forEach(v => {
          const label = v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          tags.push(`<span class="tag tag-${cat}">${label}</span>`);
        });
      }
    }

    const status = getOpportunityStatus(opp);
    const deadlineDate = parseDeadline(opp);

    let statusHtml = '';
    let dateInfoHtml = '';

    if (status === 'closed') {
      statusHtml = '<span class="status-badge status-closed">Closed</span>';
      if (deadlineDate && opp.deadline_display !== 'Closed') {
        const displayDate = opp.deadline_display || deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        dateInfoHtml = `<div class="card-deadline"><span class="deadline-date">Was due ${displayDate}</span></div>`;
      } else {
        dateInfoHtml = '<div class="card-deadline"><span class="deadline-date">Applications closed</span></div>';
      }
    } else {
      // Open status
      statusHtml = '<span class="status-badge status-open">Open</span>';
      if (deadlineDate) {
        const daysUntil = getDaysUntil(deadlineDate);
        const relative = getRelativeTime(daysUntil);
        const displayDate = opp.deadline_display || deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        dateInfoHtml = `
          <div class="card-deadline">
            <span class="deadline-date">Due ${displayDate}</span>
            ${relative && relative.text ? `<span class="deadline-relative ${relative.className}">(${relative.text})</span>` : ''}
          </div>
        `;
      }
    }

    return `
      <div class="card${status === 'closed' ? ' expired' : ''}">
        <div class="card-header">
          <h3 class="card-title">${statusHtml}<a href="${opp.url}" target="_blank" rel="noopener">${opp.name}</a></h3>
        </div>
        <p class="card-source">${opp.source}</p>
        ${dateInfoHtml}
        <p class="card-description">${opp.description}</p>
        <div class="card-tags">${tags.join('')}</div>
        <a class="card-visit" href="${opp.url}" target="_blank" rel="noopener">Visit website →</a>
      </div>
    `;
  }).join('');

  updateStats();
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('sort').addEventListener('change', (e) => {
  currentSort = e.target.value;
  render();
});

// Description expand/collapse - just toggle on the description text
document.getElementById('cards').addEventListener('click', (e) => {
  const description = e.target.closest('.card-description');
  if (description) {
    e.stopPropagation();
    description.classList.toggle('expanded');
  }
});

loadData();
