const { REST, Routes } = require('discord.js');
require('dotenv').config();
const config = require('./config.json');
const fs = require('fs');

const token = process.env.TOKEN;
const clientId = config.clientId;
const guildId = config.guildId;

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    console.log(`Loading command: ${file}`);
    if (command.data && typeof command.data.toJSON === 'function') {
        commands.push(command.data.toJSON());
    } else {
        console.error(`Command ${file} is not properly formatted.`);
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started registering slash commands.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log('Successfully registered slash commands.');
    } catch (error) {
        console.error(error);
    }
})();
