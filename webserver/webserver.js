const express = require('express');
const path = require('path');
const { getServiceStatuses, calculateUptime, authorize, getStatusesByDate, getServiceUptimeHistory } = require('../database/database');
const app = express();
const config = require('../config.json');

app.use(express.static(path.join(__dirname, 'public')));
 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/statuses', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(`http://${config.webserverPublicAddress}/api/statuses`, {
            headers: {
                Authorization: 'c7d726b205c301a4117f4134b0d651b43518f720362a02d866cde2f83d03d2a6',
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
                const categorizedServices = {};
                services.forEach((service) => {
                    const status = {
                        name: service.name,
                        current_status: service.current_status ? '🟢 Online' : '🔴 Offline',
                        uptimes: {
                            daily: dailyUptime[service.name] || 0,
                            weekly: weeklyUptime[service.name] || 0,
                            monthly: monthlyUptime[service.name] || 0,
                            all: allTimeUptime[service.name] || 0,
                        },
                    };

                    if (!categorizedServices[service.category]) {
                        categorizedServices[service.category] = [];
                    }
                    categorizedServices[service.category].push(status);
                });

                res.json(categorizedServices);
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


app.listen(3000, () => console.log('Webserver running on http://localhost:3000'));
