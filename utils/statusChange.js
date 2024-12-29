const { Client, TextChannel } = require('discord.js');
const { getServiceStatuses, getAlerts, saveAlert, deleteAlert } = require('../database/database');
const config = require('../config.json');

const monitorServices = async (client) => {
    const alertMap = new Map();
    const downtimeStartMap = new Map();

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

                if (current_status === 0) {
                    if (!downtimeStartMap.has(name)) {
                        downtimeStartMap.set(name, new Date());
                    }

                    const downtimeStart = downtimeStartMap.get(name);
                    const now = new Date();
                    const minutesDown = Math.floor((now - downtimeStart) / 60000);

                    if (minutesDown >= 5 && !alertMap.has(name)) {
                        const alertMessage = await alertChannel.send({
                            content: `<t:${Math.floor(downtimeStart.getTime() / 1000)}> - <@&${alertRole}>, the service **${name}** is marked as offline.`,
                        });
                        alertMap.set(name, alertMessage.id);
                        saveAlert(name, alertMessage.id);
                    }
                } else if (current_status === 1) {
                    if (alertMap.has(name)) {
                        const alertMessageId = alertMap.get(name);
                        try {
                            const alertMessage = await alertChannel.messages.fetch(alertMessageId);
                            if (alertMessage) await alertMessage.delete();
                        } catch (error) {
                            console.error(`Error deleting alert message for service ${name}:`, error.message);
                        }
                        alertMap.delete(name);
                        deleteAlert(name);
                    }

                    downtimeStartMap.delete(name);
                }
            }
        });
    }, 60000);
};

module.exports = { monitorServices };
