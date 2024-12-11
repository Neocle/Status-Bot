const { SlashCommandBuilder } = require('discord.js');
const { generateAndStoreToken } = require('../database/database'); // Import the token function

module.exports = {
    data: new SlashCommandBuilder()
        .setName('generate-token')
        .setDescription('Generates an API token for accessing the statuses.')
        .addUserOption((option) =>
            option.setName('user').setDescription('User to assign the token to').setRequired(true)
        ),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        const user = interaction.options.getUser('user');

        generateAndStoreToken(user.id, (err, token) => {
            if (err) {
                return interaction.reply({
                    content: '❌ Failed to generate a token. Please try again later.',
                    ephemeral: true,
                });
            }

            interaction.reply({
                content: `✅ Token generated for ${user.tag}: \`${token}\``,
                ephemeral: true,
            });
        });
    },
};
