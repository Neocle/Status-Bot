const express = require('express');
const path = require('path');
const fs = require('fs');
const { getServiceStatuses, calculateUptime, authorize, getStatusesByDate, getServiceUptimeHistory, getIncidents } = require('../database/database');
const app = express();
const config = require('../config.json');
require('dotenv').config();

function renderTemplate(filePath, data) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const key in data) {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(placeholder, data[key]);
    }
    return content;
}

app.get('/', (req, res) => {
    const html = renderTemplate(path.join(__dirname, 'public', 'index.html'), {
        title: config.webserver.title,
        themeColor: config.webserver.themeColor,
        logo: config.webserver.logo,
        favicon: config.webserver.favicon,
        description: config.webserver.description,
        openGraphImage: config.webserver.openGraphImage,
    });
  res.send(html);
});

app.get('/script', (req, res) => {

    const jsFilePath = path.join(__dirname, 'public', `script.js`);

    if (fs.existsSync(jsFilePath)) {
        const jsContent = renderTemplate(jsFilePath, {
            title: config.webserver.title,
            themeColor: config.webserver.themeColor,
            logo: config.webserver.logo,
            favicon: config.webserver.favicon,
            description: config.webserver.description,
            openGraphImage: config.webserver.openGraphImage,
        });

        res.send(jsContent);
    } else {
        res.status(404).send('Script not found');
    }
});


app.get('/statuses', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(`${config.webserver.publicAddress}/api/statuses`, {
            headers: {
                Authorization: process.env.SECRET_PASSWORD,
            },
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Error fetching statuses:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/incidents', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(`${config.webserver.publicAddress}/api/services/incidents`, {
            headers: {
                Authorization: process.env.SECRET_PASSWORD,
            },
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Error fetching statuses:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/statuses', authorize, (req, res) => {
    getServiceStatuses((err, services) => {
        if (err) {
            console.error('Error retrieving services:', err);
            return res.status(500).send('Internal Server Error');
        }

        const fetchUptimeForPeriod = (period) => {
            return new Promise((resolve, reject) => {
                calculateUptime(period, (uptimeErr, uptimes) => {
                    if (uptimeErr) {
                        return reject(uptimeErr);
                    }
                    const uptimeMap = uptimes.reduce((acc, row) => {
                        acc[row.name] = row.average_uptime || 0;
                        return acc;
                    }, {});
                    resolve(uptimeMap);
                });
            });
        };

        Promise.all([
            fetchUptimeForPeriod('daily'),
            fetchUptimeForPeriod('weekly'),
            fetchUptimeForPeriod('monthly'),
            fetchUptimeForPeriod('all'),
        ])
            .then(([dailyUptime, weeklyUptime, monthlyUptime, allTimeUptime]) => {
                const categorizedStatuses = {};

                services.forEach((service) => {
                    let statusText;
                    let statusEmoji;

                    if (typeof service.current_status === 'string') {
                        let severityEmoji = '';
                        switch (service.severity.toLowerCase()) {
                            case 'low':
                                severityEmoji = '🟡';
                                statusText = service.current_status;
                                break;
                            case 'medium':
                                severityEmoji = '🟠';
                                statusText = service.current_status;
                                break;
                            case 'high':
                                severityEmoji = '🔴';
                                statusText = service.current_status;
                                break;
                            default:
                                severityEmoji = '⚪';
                                statusText = service.current_status;
                                break;
                        }
                        statusEmoji = severityEmoji;
                    } else {
                        if (service.current_status === 1) {
                            statusEmoji = '🟢';
                            statusText = 'Online';
                        } else {
                            statusEmoji = '🔴';
                            statusText = 'Offline';
                        }
                    }

                    const uptime = {
                        daily: dailyUptime[service.name] || 0,
                        weekly: weeklyUptime[service.name] || 0,
                        monthly: monthlyUptime[service.name] || 0,
                        all: allTimeUptime[service.name] || 0,
                    };

                    const status = {
                        name: service.name,
                        current_status: `${statusEmoji} ${statusText}`,
                        uptimes: uptime,
                    };

                    if (!categorizedStatuses[service.category]) {
                        categorizedStatuses[service.category] = [];
                    }
                    categorizedStatuses[service.category].push(status);
                });

                res.json(categorizedStatuses);
            })
            .catch((uptimeErr) => {
                console.error('Error calculating uptimes:', uptimeErr);
                res.status(500).send('Internal Server Error');
            });
    });
});

app.get('/api/statuses/date/:date', authorize, (req, res) => {
    let { date } = req.params;

    const dateParts = date.split('-');
    if (dateParts.length === 3) {
        if (dateParts[2].length === 4) {
            date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        }
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return res.status(400).send('Invalid date format. Use DD-MM-YYYY.');
    }

    getStatusesByDate(date, (err, statuses) => {
        if (err) {
            console.error(`Error fetching statuses for date ${date}:`, err);
            return res.status(500).send('Internal Server Error');
        }

        if (!statuses || statuses.length === 0) {
            return res.status(404).send(`No statuses found for the date ${date}.`);
        }

        res.json(statuses);
    });
});

app.get('/api/services/:serviceId/uptime', authorize, async (req, res) => {
    const { serviceId } = req.params;
    const { days = 30 } = req.query;

    const daysCount = parseInt(days, 10);
    if (isNaN(daysCount) || daysCount <= 0) {
        return res.status(400).send('Invalid days parameter. It must be a positive number.');
    }

    try {
        const uptimeHistory = await getServiceUptimeHistory(serviceId, daysCount);

        if (!uptimeHistory || uptimeHistory.length === 0) {
            return res.status(404).send(`No uptime history found for service ID ${serviceId} in the last ${daysCount} days.`);
        }

        const formattedHistory = uptimeHistory.map((day) => ({
            date: day.date,
            uptime: day.uptime_percentage,
        }));

        res.json({ serviceId, days: formattedHistory });
    } catch (error) {
        console.error(`Error fetching uptime history for service ${serviceId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/services/incidents', authorize, (req, res) => {
    const { serviceName, date } = req.query;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (date && !dateRegex.test(date)) {
        return res.status(400).send('Invalid date format. Please use YYYY-MM-DD.');
    }

    getIncidents((err, incidents) => {
        if (err) {
            console.error('Error retrieving incidents:', err.message);
            return res.status(500).send('Internal Server Error');
        }

        const filteredIncidents = incidents.filter(incident => {
            const incidentService = incident.service || '';

            const matchesService = serviceName ? incidentService.toLowerCase() === serviceName.toLowerCase() : true;
            const matchesDate = !date || incident.date.startsWith(date);

            return matchesService && matchesDate;
        });

        if (!filteredIncidents || filteredIncidents.length === 0) {
            return res.status(200).json({
                service: serviceName || 'All Services',
                incidents: [],
                message: 'No incidents found for the given criteria.',
            });
        }

        res.json({
            service: serviceName || 'All Services',
            incidents: filteredIncidents,
        });
    });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(`${config.webserver.port}`, () => console.log(`Webserver running on http://localhost:${config.webserver.port}`));
