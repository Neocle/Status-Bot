const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const { saveEmbedInfo } = require('../database/database');
const { getServiceStatuses } = require('../database/database');

const startEmbedUpdates = async (client, channelId, messageId) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId);
    if (!message) return;

    const embed = new EmbedBuilder().setTitle('Service Status').setColor(Colors.Blue);

    setInterval(() => {
        getServiceStatuses((err, rows) => {
            if (err) {
                console.error('Failed to retrieve service statuses:', err.message);
                return;
            }

            const categorizedStatuses = {};
            rows.forEach((row) => {
                const uptimePercentage = ((row.uptime / row.checks) * 100).toFixed(2);
                const status = `${row.name}: ${
                    row.current_status ? '🟢 Online' : '🔴 Offline'
                } (${uptimePercentage}% uptime)`;

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
            message.edit({ embeds: [embed] });
        });
    }, 60000); 
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('statuspanel')
        .setDescription('Sends a status panel and regularly updates it.'),
    async execute(interaction) {
        const embed = new EmbedBuilder().setTitle('Service Status').setColor(Colors.Blue);

        await interaction.reply({ content: 'Status panel sent!', ephemeral: true });

        const message = await interaction.followUp({ embeds: [embed], fetchReply: true });

        saveEmbedInfo(interaction.channelId, message.id);
        startEmbedUpdates(interaction.client, interaction.channelId, message.id);
    },
    startEmbedUpdates,
};
