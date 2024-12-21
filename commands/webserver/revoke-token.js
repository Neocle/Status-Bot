const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { revokeToken } = require('../../database/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('revoke-token')
        .setDescription('Revokes an API token.')
        .addStringOption(option =>
            option.setName('token').setDescription('The token to revoke').setRequired(true)
        ),
    async execute(interaction) {

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need to have **Administrator** permissions to use this command.',
                ephemeral: true,
            });
        }

        const token = interaction.options.getString('token');

        revokeToken(token, (err) => {
            if (err) {
                return interaction.reply({
                    content: '❌ Failed to revoke the token. Please try again later.',
                    ephemeral: true,
                });
            }

            interaction.reply({
                content: '✅ The token has been successfully revoked.',
                ephemeral: true,
            });
        });
    },
};
