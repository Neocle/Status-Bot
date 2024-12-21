const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getIncidents, removeIncident } = require('../../database/database');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove-incident')
        .setDescription('Removes an incident')
        .addStringOption((option) =>
            option
                .setName('incident')
                .setDescription('Incident title and service')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        
        getIncidents((err, incidents) => {
            if (err) {
                console.error('Error fetching incidents for autocomplete:', err);
                return interaction.respond([]);
            }

            const filtered = incidents
                .map((incident) => `${incident.title} (${incident.service})`)
                .filter((incident) =>
                    incident.toLowerCase().includes(focusedValue.toLowerCase())
                )
                .slice(0, 25);

            interaction.respond(
                filtered.map((incident) => ({
                    name: incident,
                    value: incident,
                }))
            );
        });
    },

    async execute(interaction) {

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need to have **Administrator** permissions to use this command.',
                ephemeral: true,
            });
        }

        const incidentString = interaction.options.getString('incident');
        const [title, service] = incidentString.split(' (');
        const cleanedService = service.replace(')', '');

        removeIncident(title, cleanedService, (err) => {
            if (err) {
                return interaction.reply({
                    content: `❌ Failed to remove incident: ${err.message}`,
                    ephemeral: true,
                });
            }

            interaction.reply({
                content: `✅ Incident '${title}' from service '${cleanedService}' has been removed.`,
                ephemeral: true,
            });
        });
    },
};
