const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();
const { initializeServices, getEmbedInfo } = require('./database/database');
const { startEmbedUpdates } = require('./commands/statuspanel');
const config = require('./config.json');
const { monitorServices } = require('./utils/statusChange');

initializeServices(config.services);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

exec('node deploy-commands.js', (error, stdout, stderr) => {
    if (error) {
        console.error(`${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`${stderr}`);
        return;
    }
    console.log(`${stdout}`);
});

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
    console.log(`${client.user.tag} is online!`);

    getEmbedInfo((err, embedInfo) => {
        if (err || !embedInfo) {
            console.warn('No embed info found or error retrieving it:', err?.message || 'No data');
            return;
        }
        startEmbedUpdates(client, embedInfo.channel_id, embedInfo.message_id);
    });

    monitorServices(client)
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: 'There was an error executing this command!',
            ephemeral: true,
        });
    }
});

client.login(process.env.TOKEN);
require("./webserver/webserver.js");
