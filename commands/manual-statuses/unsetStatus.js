const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { unsetManualStatus, getServices } = require('../../database/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unset-status')
        .setDescription('Removes the manually defined status for a service.')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the service')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need to have **Administrator** permissions to use this command.',
                ephemeral: true,
            });
        }

        const serviceId = interaction.options.getString('id');

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

            unsetManualStatus(serviceName, (unsetErr) => {
                if (unsetErr) {
                    console.error(`Error unsetting manual status for "${serviceName}":`, unsetErr.message);
                    return interaction.reply({
                        content: `❌ Failed to remove manual status for "${serviceName}".`,
                        ephemeral: true,
                    });
                }

                interaction.reply({
                    content: `✅ Manual status for "${serviceName}" (ID: ${serviceId}) has been successfully removed.`,
                    ephemeral: true,
                });
            });
        });
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();

        getServices((err, services) => {
            if (err) {
                console.error('Error fetching services for autocomplete:', err.message);
                return interaction.respond([]);
            }

            const filteredServices = services
                .filter(service =>
                    service.id.toString().includes(focusedValue)
                )
                .slice(0, 25);

            interaction.respond(
                filteredServices.map(service => ({
                    name: `${service.name} (ID: ${service.id})`,
                    value: service.id.toString(),
                }))
            );
        });
    }
};
