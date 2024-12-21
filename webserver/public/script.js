let selectedPeriod = 'daily';

async function fetchStatuses() {
  try {
    const response = await fetch("/statuses");

    if (!response.ok) throw new Error('Failed to fetch statuses');

    const categorizedServices = await response.json();
    renderCategories(categorizedServices, 'daily');
    updateAlertBanner(categorizedServices);
  } catch (error) {
    console.error('Error fetching statuses:', error);
    document.getElementById('status-container').innerHTML = '<p class="text-red-500 text-center">Failed to load statuses.</p>';
  }
}

async function fetchAndRenderIncidents() {
  try {
    const response = await fetch("/incidents");

    if (!response.ok) throw new Error('Failed to fetch incidents');

    const data = await response.json();
    const incidents = data.incidents || [];
    const groupedIncidents = groupIncidentsByDate(incidents);
    const last14Days = generateLast14Days();

    renderAllDaysWithIncidents(last14Days, groupedIncidents);
  } catch (error) {
    console.error('Error fetching incidents:', error);
  }
}

function generateLast14Days() {
  const dates = [];
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const formattedDate = date.toISOString().split('T')[0];
    dates.push(formattedDate);
  }

  return dates;
}

function groupIncidentsByDate(incidents) {
  return incidents.reduce((grouped, incident) => {
    const incidentDate = incident.date.split(" ")[0];

    if (!grouped[incidentDate]) {
      grouped[incidentDate] = [];
    }

    grouped[incidentDate].push(incident);

    return grouped;
  }, {});
}


function renderAllDaysWithIncidents(last14Days, groupedIncidents) {
  const container = document.getElementById('outages-container');
  container.innerHTML = '';

  const today = new Date().toISOString().split('T')[0];

  last14Days.forEach(date => {
    const incidentsForDate = groupedIncidents[date] || [];

    const displayDate = date === today ? 'Today' : date;

    let dateHTML = `
      <div class="mb-4">
        <p class="font-medium">${displayDate}</p>
        <hr class="border-t border-gray-300 my-2">
    `;
    container.innerHTML += dateHTML;

    if (incidentsForDate.length > 0) {
      incidentsForDate.forEach((incident, index) => {
        const severityClass = getSeverityColorClass(incident.severity);

        const incidentHTML = `
          <div class="mb-4">
            <p><strong class="${severityClass} text-lg">${incident.service}:</strong> <span class="${severityClass} font-bold text-xl">${incident.title}</span></p>
            <p class="text-sm text-gray-700 dark:text-gray-300 transition-colors duration-500">${incident.description} <span class="text-xs text-gray-400 block mt-1">${incident.date}</span></p>
          </div>
        `;
        container.innerHTML += incidentHTML;

        if (index === incidentsForDate.length - 1) {
          container.innerHTML += `<div class="mb-12"></div>`;
        }
      });
    } else {
      const noIncidentsHTML = `<p>No incidents reported.</p>`;
      container.innerHTML += noIncidentsHTML;
      container.innerHTML += `<div class="mb-12"></div>`;
    }

    container.innerHTML += `</div>`;
  });
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSeverityColorClass(severity) {
  switch (severity) {
    case 'Minor Outage':
      return 'text-yellow-500';
    case 'Moderate Outage':
      return 'text-orange-500';
    case 'Major Outage':
      return 'text-orange-800';
    case 'Critical Outage':
      return 'text-red-500';
    default:
      return 'text-gray-700';
  }
}

function updateAlertBanner(data) {
  const alertBanner = document.getElementById('alert-banner');

  let totalServices = 0;
  let servicesDown = 0;
  let servicesWithIssues = 0;

  Object.values(data).forEach(services => {
    totalServices += services.length;
    services.forEach(service => {
      if (service.current_status.includes('Offline')) {
        servicesDown++;
      }
      else if (service.current_status.includes('🟡') || service.current_status.includes('🟠') || service.current_status.includes('🔴') ) {
        servicesWithIssues++;
      }
    });
  });

  let bannerStyle = 'bg-green-600';
  let bannerMessage = `All Services Operational`;

  if (servicesDown > 0) {
    const downPercentage = ((servicesDown * 1.25 + servicesWithIssues) / totalServices) * 100;

    if (downPercentage >= 90) {
      bannerStyle = 'outline outline-2 outline-red-900 bg-red-800';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 80) {
      bannerStyle = 'outline outline-2 outline-red-800 bg-red-700';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 70) {
      bannerStyle = 'outline outline-2 outline-red-700 bg-red-600';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 60) {
      bannerStyle = 'outline outline-2 outline-orange-700 bg-orange-600';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 50) {
      bannerStyle = 'outline outline-2 outline-orange-600 bg-orange-500';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 40) {
      bannerStyle = 'outline outline-2 outline-yellow-600 bg-yellow-500';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 30) {
      bannerStyle = 'outline outline-2 outline-yellow-500 bg-yellow-400';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 20) {
      bannerStyle = 'outline outline-2 outline-yellow-500 bg-yellow-400';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else if (downPercentage >= 10) {
      bannerStyle = 'outline outline-2 outline-yellow-500 bg-yellow-400';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down${servicesWithIssues >= 1 ? `, ${servicesWithIssues} Service${servicesWithIssues > 1 ? 's' : ''} with a degraded experience` : ''}`;
    } else {
      bannerStyle = 'outline outline-2 outline-green-600 bg-green-500';
      bannerMessage = `All services are running smoothly.`;
    }    
  }

  alertBanner.innerHTML = `<p class="font-medium">${bannerMessage}</p>`;
  alertBanner.className = `text-white text-2xl pl-4 py-4 shadow-md mx-auto w-full max-w-4xl mt-4 ${bannerStyle}`;
  alertBanner.classList.remove('hidden');
}

function renderCategories(data) {
  const container = document.getElementById('status-container');
  container.innerHTML = '';

  Object.entries(data).forEach(([category, services]) => {
    const section = document.createElement('section');
    section.className = 'mb-12';
    section.innerHTML = `
      <h2 class="text-lg font-semibold text-gray-700 mb-2 dark:text-white transition-colors duration-500">${category}</h2>
      <div class="bg-white shadow-md rounded-lg dark:bg-zinc-700 transition-colors duration-500">
        ${services.map(service => {
          const statusColor = getStatusColor(service.current_status);
          return `
            <div class="flex justify-between px-4 py-3 ${services.indexOf(service) !== services.length - 1 ? 'border-b dark:border-b dark:border-zinc-800 transition-colors duration-500' : ''}">
              <div>
                <span class="block dark:text-white transition-colors duration-500">${service.name}</span>
                <span class="text-gray-500 text-sm dark:text-gray-300 transition-colors duration-500">
                  Uptime: ${(service.uptimes && service.uptimes[selectedPeriod] !== undefined) 
                    ? service.uptimes[selectedPeriod].toFixed(2) 
                    : 'N/A'}%
                </span>
              </div>
              <div class="flex items-center">
                <span class="w-5 h-5 rounded-full" style="background-color: ${statusColor}; margin-right: 12px;"></span>
                <span class="font-medium self-center" style="color: ${statusColor};">
                  ${service.current_status.replace(/🟢|🟡|🟠|🔴/, '')}
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.appendChild(section);
  });
}

function getStatusColor(status) {
  if (status.includes('🟢')) return '#28a745';
  if (status.includes('🟡')) return '#ffc107';
  if (status.includes('🟠')) return '#fd7e14';
  if (status.includes('🔴')) return '#dc3545';
  return '#6c757d';
}

function filterStatus(period) {
  selectedPeriod = period;

  document.querySelectorAll("button").forEach(button => {
    if (button.id === "dark-mode-toggle") return;

    button.classList.add("bg-gray-300", "text-gray-700", "dark:bg-zinc-700", "dark:text-white");
    button.classList.remove("bg-[{{themeColor}}]", "text-white");
  });

  const clickedButton = document.getElementById(period);
  clickedButton.classList.remove("bg-gray-300", "text-gray-700", "dark:bg-zinc-700", "dark:text-white");
  clickedButton.classList.add("bg-[{{themeColor}}]", "text-white");

  fetchStatuses();
}


if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  toggleDarkMode();
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  
  const icon = document.getElementById('dark-mode-icon');
  
  if (document.documentElement.classList.contains('dark')) {
    icon.classList.remove('fa-moon');
    icon.classList.add('fa-sun');
  } else {
    icon.classList.remove('fa-sun');
    icon.classList.add('fa-moon');
  }
}

document.addEventListener('DOMContentLoaded', fetchStatuses);
document.addEventListener('DOMContentLoaded', fetchAndRenderIncidents);
