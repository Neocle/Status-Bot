const net = require('net');

const pingService = async (host, port) => {
    return new Promise((resolve) => {
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
};

module.exports = pingService;
