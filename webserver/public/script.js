async function fetchStatuses() {
  try {
    const response = await fetch("/statuses");

    if (!response.ok) throw new Error('Failed to fetch statuses');

    const categorizedServices = await response.json();
    renderCategories(categorizedServices);
    updateAlertBanner(categorizedServices);
  } catch (error) {
    console.error('Error fetching statuses:', error);
    document.getElementById('status-container').innerHTML = '<p class="text-red-500 text-center">Failed to load statuses.</p>';
  }
}

function updateAlertBanner(data) {
  const alertBanner = document.getElementById('alert-banner');

  let totalServices = 0;
  let servicesDown = 0;

  Object.values(data).forEach(services => {
    totalServices += services.length;
    services.forEach(service => {
      if (service.current_status.includes('🔴')) {
        servicesDown++;
      }
    });
  });

  let bannerColor = 'bg-green-600';
  let bannerMessage = `All Services Operational`;

  if (servicesDown > 0) {
    const downPercentage = (servicesDown / totalServices) * 100;

    if (downPercentage >= 70) {
      bannerColor = 'bg-red-600';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down - Critical Issue`;
    } else if (downPercentage >= 30) {
      bannerColor = 'bg-yellow-500';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down - Degraded Performance`;
    } else {
      bannerColor = 'bg-yellow-400';
      bannerMessage = `${servicesDown} Service${servicesDown > 1 ? 's' : ''} Down`;
    }
  }

  alertBanner.innerHTML = `<p class="font-medium">${bannerMessage}</p>`;
  alertBanner.className = `text-white text-2xl pl-4 py-4 shadow-md mx-auto w-full max-w-4xl mt-4 rounded ${bannerColor}`;
  alertBanner.classList.remove('hidden');
}

function renderCategories(data) {
  const container = document.getElementById('status-container');
  container.innerHTML = '';

  Object.entries(data).forEach(([category, services]) => {
    const section = document.createElement('section');
    section.className = 'mb-12';
    section.innerHTML = `
      <h2 class="text-lg font-semibold text-gray-700 mb-2">${category}</h2>
      <div class="bg-white shadow-md rounded-lg">
        ${services.map(service => `
          <div class="flex justify-between px-4 py-3 ${services.indexOf(service) !== services.length - 1 ? 'border-b' : ''}">
            <div>
              <span class="block">${service.name}</span>
              <span class="text-gray-500 text-sm">Uptime: ${service.uptimes.daily.toFixed(2)}%</span>
            </div>
            <span class="font-medium self-center ${service.current_status.includes('🟢') ? 'text-green-500' : 'text-red-500'}">
              ${service.current_status}
            </span>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(section);
  });
}

document.addEventListener('DOMContentLoaded', fetchStatuses);
