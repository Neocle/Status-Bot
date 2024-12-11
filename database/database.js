const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const pingService = require('../utils/pingService');
const config = require('../config.json');
const crypto = require('crypto');

const RATE_LIMIT_WINDOW = config.rateLimitTime;
const MAX_REQUESTS = config.rateLimit;

const rateLimits = new Map();

const db = new sqlite3.Database(path.resolve(__dirname, 'status.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS service_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            category TEXT NOT NULL,
            current_status INTEGER DEFAULT 0,
            uptime INTEGER DEFAULT 0,
            downtime INTEGER DEFAULT 0,
            checks INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS daily_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            uptime_percentage REAL DEFAULT 0,
            finalized BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (service_id) REFERENCES service_status(id),
            UNIQUE(service_id, date) ON CONFLICT REPLACE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS status_embeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_name TEXT NOT NULL UNIQUE,
            message_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (service_name) REFERENCES service_status(name)
        )
    `);
});

const saveEmbedInfo = (channelId, messageId) => {
    db.run(
        `INSERT INTO status_embeds (channel_id, message_id) VALUES (?, ?)`,
        [channelId, messageId],
        (err) => {
            if (err) console.error('Error saving embed info:', err.message);
        }
    );
};

const getEmbedInfo = (callback) => {
    db.get(`SELECT * FROM status_embeds ORDER BY id DESC LIMIT 1`, [], (err, row) => {
        if (err) {
            console.error('Error retrieving embed info:', err.message);
            callback(err, null);
        } else {
            callback(null, row);
        }
    });
};

const initializeServices = (services) => {
    services.forEach((service) => {
        db.run(
            `INSERT INTO service_status (name, host, port, category)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(name) DO UPDATE SET
             host = excluded.host,
             port = excluded.port,
             category = excluded.category`,
            [service.name, service.host, service.port, service.category],
            (err) => {
                if (err) console.error('Error initializing services:', err.message);
            }
        );
    });

    const serviceNames = services.map((s) => s.name);
    db.run(
        `DELETE FROM service_status WHERE name NOT IN (${serviceNames.map(() => '?').join(',')})`,
        serviceNames,
        (err) => {
            if (err) console.error('Error cleaning up outdated services:', err.message);
        }
    );
};

const getServiceStatuses = (callback) => {
    db.all(`SELECT * FROM service_status`, [], (err, rows) => {
        if (err) {
            console.error('Error retrieving service statuses:', err.message);
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};

const updateServiceStatus = (name, success) => {
    db.get(`SELECT * FROM service_status WHERE name = ?`, [name], (err, row) => {
        if (err) {
            console.error('Error querying service status:', err.message);
            return;
        }

        const checks = (row?.checks || 0) + 1;
        const uptime = (row?.uptime || 0) + (success ? 1 : 0);
        const downtime = (row?.downtime || 0) + (success ? 0 : 1);
        const currentStatus = success ? 1 : 0;

        db.run(
            `UPDATE service_status SET uptime = ?, downtime = ?, checks = ?, current_status = ? WHERE name = ?`,
            [uptime, downtime, checks, currentStatus, name],
            (err) => {
                if (err) console.error('Error updating service status:', err.message);
            }
        );
    });
};


const recordDailyUptime = (name) => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    db.get(`SELECT * FROM service_status WHERE name = ?`, [name], (err, row) => {
        if (err || !row) {
            console.error('Error retrieving service for daily uptime:', err?.message || 'Not found');
            return;
        }

        const uptimePercentage = row.checks ? (row.uptime / row.checks) * 100 : 0;

        db.get(
            `SELECT * FROM daily_status WHERE service_id = ? AND date = ?`,
            [row.id, date],
            (err, existingRecord) => {
                if (err) {
                    console.error(`Error querying daily_status for ${name}:`, err.message);
                    return;
                }

                if (existingRecord) {
                    db.run(
                        `UPDATE daily_status SET uptime_percentage = ? WHERE service_id = ? AND date = ?`,
                        [uptimePercentage, row.id, date],
                        (err) => {
                            if (err) {
                                console.error(`Error updating daily_status for ${name}:`, err.message);
                            }
                        }
                    );
                } else {
                    db.run(
                        `INSERT INTO daily_status (service_id, date, uptime_percentage) VALUES (?, ?, ?)`,
                        [row.id, date, uptimePercentage],
                        (err) => {
                            if (err) {
                                console.error(`Error inserting into daily_status for ${name}:`, err.message);
                            } else {
                                console.log(
                                    `Inserted new daily uptime for ${name} on ${date}: ${uptimePercentage.toFixed(
                                        2
                                    )}%`
                                );
                            }
                        }
                    );
                }
            }
        );
    });
};

const calculateUptime = (period, callback) => {
    let query = `
        SELECT s.name, 
               AVG(d.uptime_percentage) AS average_uptime
        FROM daily_status d
        JOIN service_status s ON d.service_id = s.id
    `;

    const now = new Date();
    let params = [];

    if (period === 'daily') {
        query += ` WHERE d.date = ?`;
        params.push(now.toISOString().split('T')[0]); // Today's date
    } else if (period === 'weekly') {
        query += ` WHERE d.date >= ?`;
        const startOfWeek = new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0];
        params.push(startOfWeek);
    } else if (period === 'monthly') {
        query += ` WHERE d.date >= ?`;
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        params.push(startOfMonth);
    }

    query += ` GROUP BY s.name`;

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error(`Error calculating ${period} uptime:`, err.message);
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};

const lockDailyUptime = () => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    db.all(`SELECT * FROM daily_status WHERE date = ?`, [date], (err, rows) => {
        if (err) {
            console.error('Error querying daily_status to finalize:', err.message);
            return;
        }

        if (!rows.length) {
            console.log(`No daily_status records found for date ${date}.`);
            return;
        }

        rows.forEach((record) => {
            console.log(`Daily uptime finalized for Service ID=${record.service_id} on ${date}`);
        });

        db.run(
            `UPDATE daily_status SET finalized = 1 WHERE date = ?`,
            [date],
            (updateErr) => {
                if (updateErr) {
                    console.error('Error finalizing daily_status records:', updateErr.message);
                } else {
                    console.log(`All daily_status records for ${date} have been finalized.`);
                }
            }
        );
    });
};

const startPeriodicUpdates = () => {
    setInterval(async () => {
        const now = new Date();
        const currentHour = now.getHours();

        for (const service of config.services) {
            try {
                const result = await pingService(service.host, service.port);
                updateServiceStatus(service.name, result.success);
            } catch (error) {
                console.error(`Error pinging service ${service.name}:`, error.message);
                updateServiceStatus(service.name, false);
            }
        }

        config.services.forEach((service) => {
            recordDailyUptime(service.name);
        });

        if (currentHour === 0) {
            console.log('Finalizing daily uptime records...');
            lockDailyUptime();
        }
    }, 60000);
};

const generateAndStoreToken = (userId, callback) => {
    const token = crypto.randomBytes(32).toString('hex');

    db.run(
        `INSERT INTO tokens (token, user_id) VALUES (?, ?)`,
        [token, userId],
        (err) => {
            if (err) {
                console.error('Error saving token to database:', err.message);
                callback(err, null);
            } else {
                console.log(`Token generated and saved for user ${userId}: ${token}`);
                callback(null, token);
            }
        }
    );
};

const revokeToken = (token, callback) => {
    db.run(`DELETE FROM tokens WHERE token = ?`, [token], (err) => {
        if (err) {
            console.error('Error revoking token:', err.message);
            callback(err);
        } else {
            console.log(`Token successfully revoked: ${token}`);
            callback(null);
        }
    });
};


const authorize = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ error: '403 Not authorized' });
    }

    const now = Date.now();
    const tokenData = rateLimits.get(token) || { count: 0, startTime: now };

    if (now - tokenData.startTime > RATE_LIMIT_WINDOW) {
        tokenData.count = 1;
        tokenData.startTime = now;
    } else {
        tokenData.count += 1;
    }

    if (tokenData.count > MAX_REQUESTS) {
        return res.status(429).json({ error: '429 Too Many Requests. Rate limit exceeded.' });
    }

    rateLimits.set(token, tokenData);

    db.get(`SELECT * FROM tokens WHERE token = ?`, [token], (err, row) => {
        if (err) {
            console.error('Error validating token:', err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (!row) {
            return res.status(403).json({ error: '403 Not authorized' });
        }

        next();
    });
};


const getStatusesByDate = (date, callback) => {
    const sql = `
        SELECT 
            s.name,
            s.category,
            d.uptime_percentage,
            s.current_status
        FROM 
            daily_status d
        JOIN 
            service_status s ON d.service_id = s.id
        WHERE 
            d.date = ?
    `;

    db.all(sql, [date], (err, rows) => {
        if (err) {
            console.error(`Error fetching statuses for date ${date}:`, err.message);
            return callback(err, null);
        }

        if (!rows.length) {
            console.log(`No statuses found for the date ${date}.`);
            return callback(null, []);
        }

        callback(null, rows);
    });
};

const saveAlert = (serviceName, messageId) => {
    db.run(
        `INSERT INTO alerts (service_name, message_id) VALUES (?, ?)
         ON CONFLICT(service_name) DO UPDATE SET message_id = excluded.message_id`,
        [serviceName, messageId],
        (err) => {
            if (err) console.error(`Error saving alert for ${serviceName}:`, err.message);
        }
    );
};

const getAlerts = (callback) => {
    db.all(`SELECT * FROM alerts`, [], (err, rows) => {
        if (err) {
            console.error('Error fetching alerts from the database:', err.message);
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};

const deleteAlert = (serviceName) => {
    db.run(
        `DELETE FROM alerts WHERE service_name = ?`,
        [serviceName],
        (err) => {
            if (err) console.error(`Error deleting alert for ${serviceName}:`, err.message);
        }
    );
};

const getServiceUptimeHistory = (serviceName, days) => {
    return new Promise((resolve, reject) => {
        let query = `
            SELECT
                ds.date, ds.uptime_percentage
            FROM daily_status ds
            INNER JOIN service_status ss ON ds.service_id = ss.id
            WHERE ss.name = ?
            AND ds.date >= DATE('now', '-' || ? || ' days')
            ORDER BY ds.date DESC
        `;

        const params = [serviceName, days];

        db.all(query, params, (err, results) => {
            if (err) {
                console.error('Error fetching service uptime history:', err.message);
                reject(err);
            } else {
                console.log('Uptime History:', results); // Debugging
                resolve(results);
            }
        });
    });
};

startPeriodicUpdates();

module.exports = {
    initializeServices,
    getServiceStatuses,
    updateServiceStatus,
    saveEmbedInfo,
    getEmbedInfo,
    calculateUptime,
    generateAndStoreToken,
    revokeToken,
    authorize,
    getStatusesByDate,
    getServiceUptimeHistory,
    saveAlert,
    getAlerts,
    deleteAlert
};
