const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { initializeServices, getEmbedInfo } = require('./database/database');
const { startEmbedUpdates } = require('./commands/statuspanel');
const config = require('./config.json');
const { monitorServices } = require('./utils/statusChange');

initializeServices(config.services);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

function loadCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.isFile() && file.name.endsWith('.js')) {
            const command = require(fullPath);
            if (command.data && command.data.name) {
                client.commands.set(command.data.name, command);
                console.log(`Loaded command: ${command.data.name} from ${fullPath}`);
            } else {
                console.error(`Command file ${fullPath} is not properly formatted.`);
            }
        }
    }
}

const commandsPath = path.join(__dirname, 'commands');
loadCommands(commandsPath);

async function deployCommands() {
    const commands = [];

    client.commands.forEach(command => {
        if (command.data && typeof command.data.toJSON === 'function') {
            commands.push(command.data.toJSON());
        }
    });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('Started registering slash commands.');

        if (config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );
        } else {
            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands }
            );
        }

        console.log('Successfully registered slash commands.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
}

deployCommands();

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
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command && command.autocomplete) {
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error('Error in autocomplete:', error);
            }
        }
    }

    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        await interaction.reply({
            content: 'There was an error executing this command!',
            ephemeral: true,
        });
    }
});

client.login(process.env.TOKEN);
require("./webserver/webserver.js");
