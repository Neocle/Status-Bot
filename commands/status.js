const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const { getServiceStatuses, calculateUptime } = require('../database/database');

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
        const embed = new EmbedBuilder().setTitle('Service Status').setColor(Colors.Blue);

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
                    const status = `${row.name}: ${
                        row.current_status ? '🟢 Online' : '🔴 Offline'
                    } (Uptime: ${uptimeMap[row.name] || 'N/A'})`;
                
                    if (!categorizedStatuses[row.category]) {
                        categorizedStatuses[row.category] = [];
                    }
                    categorizedStatuses[row.category].push(status);
                });                

                let description = '';
                for (const [category, services] of Object.entries(categorizedStatuses)) {
                    description += `**${category}**\n${services.join('\n')}\n\n`;
                }

                embed.setDescription(description).setTimestamp();
                interaction.reply({ embeds: [embed] });
            });
        });
    }
};
