const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setManualStatus, getServices } = require('../../database/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-status')
        .setDescription('Sets a manually defined status for a service. (Admin Only)')
        .addStringOption(option =>
            option.setName('service')
                .setDescription('The ID of the service')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('status')
                .setDescription('The manual status to set (e.g., Operational, Maintenance, Down)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('severity')
                .setDescription('The severity level of this status (Low, Medium, High)')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('continue_uptime')
                .setDescription('Should uptime calculation continue?')
                .setRequired(true)
                .addChoices(
                    { name: 'Yes', value: 'yes' },
                    { name: 'No', value: 'no' }
                )
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Additional description for the manual status')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need to have **Administrator** permissions to use this command.',
                ephemeral: true,
            });
        }

        const serviceId = interaction.options.getString('service');
        const status = interaction.options.getString('status');
        const severity = interaction.options.getString('severity');
        const continueUptime = interaction.options.getString('continue_uptime');
        const description = interaction.options.getString('description') || 'No description provided';

        getServices((err, services) => {
            if (err) {
                console.error('Error fetching services:', err.message);
                return interaction.reply({
                    content: `❌ An error occurred while retrieving services.`,
                    ephemeral: true,
                });
            }

            const service = services.find(s => s.id.toString() === serviceId);
            if (!service) {
                return interaction.reply({
                    content: `❌ Service with ID "${serviceId}" not found.`,
                    ephemeral: true,
                });
            }

            const serviceName = service.name;

            setManualStatus(serviceName, status, description, severity, continueUptime, (setErr) => {
                if (setErr) {
                    console.error(`Error setting manual status for "${serviceName}":`, setErr.message);
                    return interaction.reply({
                        content: `❌ Failed to set manual status for "${serviceName}".`,
                        ephemeral: true,
                    });
                }

                interaction.reply({
                    content: `✅ Manual status for "${serviceName}" (ID: ${serviceId}) has been set.\n` +
                        `🔹 **Status**: ${status}\n` +
                        `🔸 **Severity**: ${severity}\n` +
                        `🕒 **Continue Uptime Calculation**: ${continueUptime}\n` +
                        `📋 **Description**: ${description}`,
                    ephemeral: true,
                });
            });
        });
    },

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'service') {
            getServices((err, services) => {
                if (err) {
                    console.error('Error fetching services for autocomplete:', err.message);
                    return interaction.respond([]);
                }

                const filteredServices = services
                    .filter(service =>
                        service.name.toLowerCase().includes(focusedOption.value.toLowerCase())
                    )
                    .slice(0, 25);

                interaction.respond(
                    filteredServices.map(service => ({
                        name: `${service.name} (ID: ${service.id})`,
                        value: service.id.toString(),
                    }))
                );
            });
        } else if (focusedOption.name === 'severity') {
            const severities = ['Low', 'Medium', 'High'];
            const filteredSeverities = severities.filter(severity =>
                severity.toLowerCase().includes(focusedOption.value.toLowerCase())
            );

            interaction.respond(
                filteredSeverities.map(severity => ({
                    name: severity,
                    value: severity,
                }))
            );
        }
    },
};
