const axios = require('axios');
const pingJava = (...args) => import('@minescope/mineping').then(module => module.pingJava(...args));
const pingBedrock = (...args) => import('@minescope/mineping').then(module => module.pingBedrock(...args));

const pingService = async (host, port, type = "none") => {
    if (type === "web-service") {
        const url = `http://${host}:${port}`;

        try {
            const start = Date.now();
            const response = await axios.get(url);

            const statusCode = response.status;
            if (statusCode === 200 || statusCode === 202 || statusCode === 201) {
                return { success: true, responseTime: Date.now() - start };
            } else {
                return { success: false, responseTime: null };
            }
        } catch (error) {
            return { success: false, responseTime: null };
        }
    } else if (type === "java-server") {
        try {
            const data = await pingJava(host, { port: port });
            if (data && data.description) {
                return { success: true, responseTime: data.version ? Date.now() - data.version : null, data };
            } else {
                return { success: false, responseTime: null };
            }
        } catch (err) {
            return { success: false, responseTime: null };
        }
    } else if (type === "bedrock-server") {
        try {
            const data = await pingBedrock(host, { port: port });
            if (data && data.name) {
                return { success: true, responseTime: Date.now() - START_TIME, data };
            } else {
                return { success: false, responseTime: null };
            }
        } catch (err) {
            return { success: false, responseTime: null };
        }
    } else {
        return new Promise((resolve) => {
            const net = require('net');
            const client = new net.Socket();
            const start = Date.now();

            client.connect(port, host, () => {
                client.destroy();
                resolve({ success: true, responseTime: Date.now() - start });
            });

            client.on('error', () => {
                client.destroy();
                resolve({ success: false, responseTime: null });
            });
        });
    }
};

module.exports = pingService;
