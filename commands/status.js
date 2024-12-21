const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const { getServiceStatuses, calculateUptime } = require('../database/database');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Sends a snapshot of the current service status.')
        .addStringOption((option) =>
            option
                .setName('duration')
                .setDescription('Uptime duration (daily, weekly, monthly, all times)')
                .setChoices(
                    { name: 'Daily', value: 'daily' },
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'All Time', value: 'all' }
                )
        ),
    async execute(interaction) {
        const duration = interaction.options.getString('duration') || 'all';
        const embed = new EmbedBuilder().setTitle('Service Status').setColor(config.embedsColor);

        getServiceStatuses((err, rows) => {
            if (err) {
                console.error('Failed to retrieve service statuses:', err.message);
                embed.setDescription('❌ Failed to fetch service statuses. Please try again later.');
                interaction.reply({ embeds: [embed] });
                return;
            }

            calculateUptime(duration, (uptimeErr, uptimeRows) => {
                if (uptimeErr) {
                    console.error(`Failed to calculate uptime for ${duration}:`, uptimeErr.message);
                    embed.setDescription('❌ Failed to fetch uptime data. Please try again later.');
                    interaction.reply({ embeds: [embed] });
                    return;
                }

                const uptimeMap = uptimeRows.reduce((acc, row) => {
                    acc[row.name] = row.average_uptime ? `${row.average_uptime.toFixed(2)}%` : 'N/A';
                    return acc;
                }, {});

                const categorizedStatuses = {};

                rows.forEach((row) => {
                    let statusText;
                    let statusEmoji;

                    if (typeof row.current_status === 'string') {
                        let severityEmoji = '';
                        switch (row.severity.toLowerCase()) {
                            case 'low':
                                severityEmoji = '🟡';
                                statusText = row.current_status;
                                break;
                            case 'medium':
                                severityEmoji = '🟠';
                                statusText = row.current_status;
                                break;
                            case 'high':
                                severityEmoji = '🔴';
                                statusText = row.current_status;
                                break;
                            default:
                                severityEmoji = '⚪';
                                statusText = row.current_status;
                                break;
                        }

                        statusEmoji = severityEmoji;
                    } else {
                        if (row.current_status === 1) {
                            statusEmoji = '🟢';
                            statusText = 'Online';
                        } else {
                            statusEmoji = '🔴';
                            statusText = 'Offline';
                        }
                    }

                    const uptime = uptimeMap[row.name] || 'N/A';

                    const statusLine = `${row.name}: ${statusEmoji} ${statusText} (Uptime: ${uptime})`;

                    if (!categorizedStatuses[row.category]) {
                        categorizedStatuses[row.category] = [];
                    }
                    categorizedStatuses[row.category].push(statusLine);
                });

                let description = '';
                for (const [category, services] of Object.entries(categorizedStatuses)) {
                    description += `**${category}**\n${services.join('\n')}\n\n`;
                }

                embed.setDescription(description.trim() || 'No service statuses available.').setTimestamp();
                interaction.reply({ embeds: [embed] });
            });
        });
    },
};
