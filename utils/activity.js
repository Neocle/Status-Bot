const { ActivityType } = require('discord.js');
const { getServiceStatuses } = require('../database/database');

const updateActivity = (client) => {
    const update = () => {
        getServiceStatuses((err, rows) => {
            if (err) {
                console.error('Error retrieving service statuses:', err.message);
                return;
            }

            let servicesDown = 0;
            let servicesWithIssues = 0;

            rows.forEach(service => {
                if (service.current_status === 0) {
                    servicesDown++;
                } else if (service.current_status === 1 && service.severity) {
                    servicesWithIssues++;
                }
            });

            let activityMessage = 'All services operational';
            if (servicesDown > 0 && servicesWithIssues > 0) {
                activityMessage = `${servicesDown} service${servicesDown > 1 ? 's' : ''} down, ${servicesWithIssues} with degraded performance`;
            } else if (servicesDown > 0) {
                activityMessage = `${servicesDown} service${servicesDown > 1 ? 's' : ''} down`;
            } else if (servicesWithIssues > 0) {
                activityMessage = `${servicesWithIssues} service${servicesWithIssues > 1 ? 's' : ''} with degraded performance`;
            }

            client.user.setActivity(activityMessage, { type: ActivityType.Watching });
        });
    };

    update();
    setInterval(update, 5 * 60 * 1000);
};

module.exports = { updateActivity };
