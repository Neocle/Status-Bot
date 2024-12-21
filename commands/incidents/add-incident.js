const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setNewIncident, getServices } = require('../../database/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-incident')
        .setDescription('Add an incident to a specific service.')
        .addStringOption((option) =>
            option
                .setName('date')
                .setDescription('The date of the incident (YYYY-MM-DD HH-MM)')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('service')
                .setDescription('The service affected')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option
                .setName('title')
                .setDescription('The title of the incident')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('description')
                .setDescription('A description of the incident')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('severity')
                .setDescription('The severity of the incident (Low, Medium, High, Critical)')
                .setRequired(true)
                .addChoices(
                    { name: 'Minor Outage', value: 'Minor Outage' },
                    { name: 'Moderate Outage', value: 'Moderate Outage' },
                    { name: 'Major Outage', value: 'Major Outage' },
                    { name: 'Critical Outage', value: 'Critical Outage' }
                )
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need to have **Administrator** permissions to use this command.',
                ephemeral: true,
            });
        }

        const date = interaction.options.getString('date');
        const service = interaction.options.getString('service');
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const severity = interaction.options.getString('severity');

        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date)) {
            return interaction.reply({
                content: '❌ Invalid date format! Please use YYYY-MM-DD HH-MM.',
                ephemeral: true,
            });
        }

        setNewIncident(service, title, description, severity, date, (err) => {
            if (err) {
                console.error(`Error adding incident: ${err.message}`);
                return interaction.reply({
                    content: '❌ Failed to add incident. Please try again later.',
                    ephemeral: true,
                });
            }

            interaction.reply({
                content: `✅ Incident successfully added for **${service}**\n` +
                    `🕒 Date: ${date}\n` +
                    `📜 Title: ${title}\n` +
                    `📙 Description: ${description}\n` +
                    `⚠️ Severity: **${severity}**`,
                ephemeral: true,
            });
        });
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();

        getServices((err, rows) => {
            if (err) {
                console.error('Error fetching services for autocomplete:', err.message);
                return interaction.respond([]);
            }

            const filtered = rows
                .map((row) => row.name)
                .filter((name) => name.toLowerCase().includes(focusedValue.toLowerCase()))
                .slice(0, 25);

            interaction.respond(
                filtered.map((service) => ({
                    name: service,
                    value: service,
                }))
            );
        });
    },
};
