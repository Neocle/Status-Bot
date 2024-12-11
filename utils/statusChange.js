const { Client, TextChannel } = require('discord.js');
const { getServiceStatuses, getAlerts, saveAlert, deleteAlert } = require('../database/database');
const config = require('../config.json');

const monitorServices = async (client) => {
    const alertMap = new Map();

    getAlerts((err, alerts) => {
        if (!err && alerts) {
            alerts.forEach((alert) => {
                alertMap.set(alert.service_name, alert.message_id);
            });
        }
    });

    setInterval(async () => {
        getServiceStatuses(async (err, services) => {
            if (err) {
                console.error('Error fetching service statuses:', err.message);
                return;
            }

            for (const service of services) {
                const { name, current_status, downtime } = service;
                const alertRole = config.alertRoleId;
                const alertChannelId = config.alertChannelId;

                if (!alertRole || !alertChannelId) {
                    console.warn('Alert role or channel ID not configured.');
                    continue;
                }

                const alertChannel = await client.channels.fetch(alertChannelId);
                if (!(alertChannel instanceof TextChannel)) {
                    console.error(`Channel ID ${alertChannelId} is not a text channel.`);
                    continue;
                }

                if (current_status === 0 && downtime >= 5) {
                    if (!alertMap.has(name)) {
                        const alertMessage = await alertChannel.send({
                            content: `<@&${alertRole}> Alert! Service **${name}** is down (${downtime} minutes).`,
                        });
                        alertMap.set(name, alertMessage.id);
                        saveAlert(name, alertMessage.id);
                        console.log(`Alert sent for service: ${name}`);
                    }
                } else if (current_status === 1 && alertMap.has(name)) {
                    const alertMessageId = alertMap.get(name);
                    try {
                        const alertMessage = await alertChannel.messages.fetch(alertMessageId);
                        if (alertMessage) await alertMessage.delete();
                        console.log(`Alert removed for service: ${name}`);
                    } catch (error) {
                        console.error(`Error deleting alert message for service ${name}:`, error.message);
                    }
                    alertMap.delete(name);
                    deleteAlert(name);
                }
            }
        });
    }, 60000);
};

module.exports = { monitorServices };