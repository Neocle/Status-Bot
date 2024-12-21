const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getIncidents, removeIncident, setNewIncident } = require('../../database/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit-incident')
        .setDescription('Edit an existing incident')
        .addStringOption(option => 
            option.setName('incident_id')
                .setDescription('The ID of the incident to edit')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option => 
            option.setName('title')
                .setDescription('New title for the incident')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('description')
                .setDescription('New description for the incident')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('date')
                .setDescription('New date for the incident (YYYY-MM-DD HH:mm)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('severity')
                .setDescription('New severity for the incident')
                .setRequired(false)
                .addChoices(
                    { name: 'Minor Outage', value: 'Minor Outage' },
                    { name: 'Moderate Outage', value: 'Moderate Outage' },
                    { name: 'Major Outage', value: 'Major Outage' },
                    { name: 'Critical Outage', value: 'Critical Outage' }
                )
        ),

        async autocomplete(interaction) {
            if (interaction.options.getFocused(true).name === 'incident_id') {
                const focusedValue = interaction.options.getFocused();
                getIncidents((err, incidents) => {
                    if (err) {
                        return interaction.respond([{ name: 'Error fetching incidents', value: '' }]);
                    }
                    const suggestions = incidents
                        .filter(incident => incident.title.includes(focusedValue))
                        .map(incident => ({
                            name: `${incident.title} (${incident.service})`,
                            value: incident.title
                        }));
                    interaction.respond(suggestions);
                });
            }
        },


    async execute(interaction) {

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need to have **Administrator** permissions to use this command.',
                ephemeral: true,
            });
        }

        const incidentId = interaction.options.getString('incident_id');
        const newTitle = interaction.options.getString('title');
        const newDescription = interaction.options.getString('description');
        const newDate = interaction.options.getString('date');
        const newSeverity = interaction.options.getString('severity');

        getIncidents((err, incidents) => {
            if (err) {
                console.error('Error fetching incidents:', err.message);
                return interaction.reply({ content: '❌ Error fetching incidents.', ephemeral: true });
            }

            const incident = incidents.find(i => i.title === incidentId);
            if (!incident) {
                return interaction.reply({ content: '❌ Incident not found.', ephemeral: true });
            }
            
            const updatedTitle = newTitle || incident.title;
            const updatedDescription = newDescription || incident.description;
            const updatedDate = newDate || incident.date;
            const updatedSeverity = newSeverity || incident.severity;
            const service = incident.service; 
            removeIncident(incidentId, service, (removeErr) => {
                if (removeErr) {
                    console.error('Error removing incident:', removeErr.message);
                    return interaction.reply({ content: '❌ There was an error removing the incident.', ephemeral: true });
                }
            });  
            
            setNewIncident(service, updatedTitle, updatedDescription, updatedSeverity, updatedDate, (updateErr) => {
                if (updateErr) {
                    console.error('Error updating incident:', updateErr.message);
                    return interaction.reply({ content: '❌ There was an error updating the incident.', ephemeral: true });
                }
            
                interaction.reply({ 
                    content: `✅ Incident **#${incidentId}** has been successfully updated:\n` +
                             `📜 **Title:** ${updatedTitle}\n` +
                             `📝 **Description:** ${updatedDescription}\n` +
                             `🕒 **Date:** ${updatedDate}\n` +
                             `⚠️ **Severity:** ${updatedSeverity}`,
                    ephemeral: true
                });
            });            
        });
    },
};
