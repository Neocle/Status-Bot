// commands/ping.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong and shows bot latency!'),

    async execute(interaction) {
        try {
            const sent = await interaction.reply({ content: 'Pong!', fetchReply: true });
            
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            const apiPing = Math.round(interaction.client.ws.ping);

            await interaction.editReply(`Pong! 🏓 Latency: ${latency}ms | API Ping: ${apiPing}ms`);
        } catch (error) {
            console.error('Error replying to ping command:', error);
            await interaction.reply({ content: 'There was an error processing this command.', ephemeral: true });
        }
    }
};
