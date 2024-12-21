const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const { getIncidents } = require('../../database/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('incidents')
        .setDescription('Displays the most recent incidents.'),
    
    async execute(interaction) {
        const embed = new EmbedBuilder().setTitle('Recent Incidents').setColor(Colors.Red);

        getIncidents((err, incidents) => {
            if (err) {
                console.error('Failed to retrieve incidents:', err.message);
                embed.setDescription('❌ Failed to fetch incidents. Please try again later.');
                interaction.reply({ embeds: [embed] });
                return;
            }

            const categorizedIncidents = {};

            incidents.forEach((incident) => {
                const severity = incident.severity;
                let severityEmoji = '';

                switch (severity) {
                    case 'Minor Outage':
                        severityEmoji = '🟡';
                        break;
                    case 'Moderate Outage':
                        severityEmoji = '🟠';
                        break;
                    case 'Major Outage':
                        severityEmoji = '🔴';
                        break;
                    case 'Critical Outage':
                        severityEmoji = '🟣';
                        break;
                    default:
                        severityEmoji = '⚪';
                        break;
                }

                const incidentText = `${severityEmoji} ${incident.title} - ${incident.description} (Reported at: ${incident.date})`;

                if (!categorizedIncidents[incident.service]) {
                    categorizedIncidents[incident.service] = [];
                }
                categorizedIncidents[incident.service].push(incidentText);
            });

            let description = '';
            for (const [service, incidents] of Object.entries(categorizedIncidents)) {
                description += `**${service}**\n${incidents.join('\n')}\n\n`;
            }

            embed.setDescription(description.trim() || 'No incidents reported at this time.').setTimestamp();
            interaction.reply({ embeds: [embed] });
        });
    },
};
