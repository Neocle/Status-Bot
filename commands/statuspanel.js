const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const { saveEmbedInfo, getServiceStatuses } = require('../database/database');
const config = require('../config.json');

const startEmbedUpdates = async (client, channelId, messageId) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId);
    if (!message) return;

    const embed = new EmbedBuilder().setTitle('Service Status').setColor(config.embedsColor);

    setInterval(() => {
        getServiceStatuses((err, rows) => {
            if (err) {
                console.error('Failed to retrieve service statuses:', err.message);
                return;
            }

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

                const uptimePercentage = ((row.uptime / row.checks) * 100).toFixed(2);

                const statusLine = `${row.name}: ${statusEmoji} ${statusText} (Uptime: ${uptimePercentage}%)`;

                if (!categorizedStatuses[row.category]) {
                    categorizedStatuses[row.category] = [];
                }
                categorizedStatuses[row.category].push(statusLine);
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
        .setDescription('Sends a status panel and regularly updates it.')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The channel to send the status panel to (defaults to current channel).')
                .setRequired(false)
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need to have **Administrator** permissions to use this command.',
                ephemeral: true,
            });
        }

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        if (!targetChannel.isTextBased()) {
            return interaction.reply({
                content: '❌ Please select a valid text channel.',
                ephemeral: true,
            });
        }

        const embed = new EmbedBuilder().setTitle('Service Status').setColor(config.embedsColor);

        const message = await targetChannel.send({ embeds: [embed] });

        saveEmbedInfo(targetChannel.id, message.id);
        startEmbedUpdates(interaction.client, targetChannel.id, message.id);

        await interaction.reply({
            content: `✅ Status panel has been sent to ${targetChannel}.`,
            ephemeral: true,
        });
    },
    startEmbedUpdates,
};
