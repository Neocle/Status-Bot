const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const pingService = require('../utils/pingService');
const config = require('../config.json');
const crypto = require('crypto');
require('dotenv').config();

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
        );
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
    
    db.run(`
        CREATE TABLE IF NOT EXISTS manual_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id INTEGER NOT NULL,
            manual_status TEXT NOT NULL,
            description TEXT,
            severity TEXT NOT NULL,
            continue_uptime BOOLEAN NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (service_id) REFERENCES service_status(id),
            UNIQUE (service_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            severity TEXT NOT NULL,
            date TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (service_id) REFERENCES service_status(id),
            UNIQUE (service_id)
        )
    `);

    const adminApiKey = process.env.SECRET_PASSWORD
    db.run(
        `
        INSERT OR IGNORE INTO tokens (token, user_id)
        VALUES (?, ?);
        `,
        [adminApiKey, config.clientId],
        (err) => {
            if (err) {
                console.error('Error inserting token:', err.message);
            }
        }
    );

});

const getServices = (callback) => {
    db.all(
        `SELECT id, name FROM service_status`, 
        [],
        (err, rows) => {
            if (err) {
                console.error('Error retrieving services:', err.message);
                return callback(err, null);
            }

            callback(null, rows);
        }
    );
};


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
    const servicesOrder = config.servicesOrder;

    const categoryOrder = {};
    let categoryIndex = 0;

    for (const category in servicesOrder) {
        categoryOrder[category] = categoryIndex++;
    }

    const serviceOrderMap = {};
    for (const category in servicesOrder) {
        serviceOrderMap[category] = servicesOrder[category].reduce((map, service, index) => {
            map[service] = index;
            return map;
        }, {});
    }

    db.all(
        `
        SELECT 
            ss.id, 
            ss.name, 
            ss.host, 
            ss.port, 
            ss.category, 
            COALESCE(ms.manual_status, ss.current_status) AS current_status,
            ms.severity,
            ms.continue_uptime,
            ss.uptime, 
            ss.downtime, 
            ss.checks
        FROM 
            service_status ss
        LEFT JOIN 
            manual_status ms 
        ON 
            ss.id = ms.service_id
        `,
        [],
        (err, rows) => {
            if (err) {
                console.error('Error retrieving service statuses:', err.message);
                callback(err, null);
            } else {
                rows.sort((a, b) => {
                    const categoryComparison = categoryOrder[a.category] - categoryOrder[b.category];
                    if (categoryComparison !== 0) return categoryComparison;

                    const serviceComparison = (serviceOrderMap[a.category] && serviceOrderMap[a.category][a.name]) -
                                              (serviceOrderMap[b.category] && serviceOrderMap[b.category][b.name]);

                    return serviceComparison;
                });

                callback(null, rows);
            }
        }
    );
};

const updateServiceStatus = (name, success) => {
    db.get(`SELECT * FROM service_status WHERE name = ?`, [name], (err, row) => {
        if (err) {
            console.error('Error querying service status:', err.message);
            return;
        }

        db.get(`SELECT * FROM manual_status WHERE service_id = ?`, [row.id], (manualErr, manualRow) => {
            if (manualErr) {
                console.error('Error querying manual status:', manualErr.message);
                return;
            }

            const isOffline = manualRow && manualRow.continue_uptime === 'no';

            const currentStatus = isOffline ? 0 : (success ? 1 : 0);
            const checks = (row?.checks || 0) + 1;
            const uptime = (row?.uptime || 0) + (currentStatus === 1 ? 1 : 0);
            const downtime = (row?.downtime || 0) + (currentStatus === 0 ? 1 : 0);

            db.run(
                `UPDATE service_status SET uptime = ?, downtime = ?, checks = ?, current_status = ? WHERE name = ?`,
                [uptime, downtime, checks, currentStatus, name],
                (err) => {
                    if (err) console.error('Error updating service status:', err.message);
                }
            );
        });
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
        params.push(now.toISOString().split('T')[0]);
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
    const date = new Date().toISOString().split('T')[0];

    db.all(`SELECT * FROM daily_status WHERE date = ?`, [date], (err, rows) => {
        if (err) {
            console.error('Error querying daily_status to finalize:', err.message);
            return;
        }

        if (!rows.length) {
            console.log(`No daily_status records found for date ${date}.`);
            return;
        }

        db.run(
            `UPDATE daily_status SET finalized = 1 WHERE date = ?`,
            [date],
            (updateErr) => {
                if (updateErr) {
                    console.error('Error finalizing daily_status records:', updateErr.message);
                }
            }
        );
    });
};

const resetDailyMetricsAndFinalize = (currentDate) => {
    db.get(`SELECT date FROM daily_status ORDER BY date DESC LIMIT 1`, [], (err, row) => {
        if (err) {
            console.error('Error retrieving last reset date:', err.message);
            return;
        }

        const lastResetDate = row?.date || null;

        if (lastResetDate !== currentDate) {
            if (lastResetDate) {
                db.run(
                    `UPDATE daily_status SET finalized = 1 WHERE date = ?`,
                    [lastResetDate],
                    (err) => {
                        if (err) {
                            console.error('Error finalizing daily_status:', err.message);
                        }
                    }
                );
            }

            db.run(`UPDATE service_status SET uptime = 0, downtime = 0, checks = 0`, (err) => {
                if (err) {
                    console.error('Error resetting daily metrics:', err.message);
                }
            });
        }
    });
};

const startPeriodicUpdates = () => {
    setInterval(async () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

        resetDailyMetricsAndFinalize(currentDate);

        for (const service of config.services) {
            try {
                const result = await pingService(service.host, service.port, service.type);
                updateServiceStatus(service.name, result.success);
            } catch (error) {
                console.error(`Error pinging service ${service.name}:`, error.message);
                updateServiceStatus(service.name, false);
            }
        }

        config.services.forEach((service) => {
            recordDailyUptime(service.name);
        });
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

const setManualStatus = (serviceName, manualStatus, description, severity, continueUptime, callback) => {
    db.get(`SELECT id FROM service_status WHERE name = ?`, [serviceName], (err, row) => {
        if (err || !row) {
            return callback(err || new Error('Service not found'));
        }

        db.run(
            `INSERT INTO manual_status (service_id, manual_status, description, severity, continue_uptime) 
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(service_id) DO UPDATE SET 
             manual_status = excluded.manual_status, 
             description = excluded.description,
             severity = excluded.severity,
             continue_uptime = excluded.continue_uptime,
             updated_at = CURRENT_TIMESTAMP`,
            [row.id, manualStatus, description, severity, continueUptime],
            (insertErr) => {
                if (insertErr) {
                    console.error(`Error setting manual status for '${serviceName}':`, insertErr.message);
                    return callback(insertErr);
                }
                callback(null);
            }
        );
    });
};

const unsetManualStatus = (serviceName, callback) => {
    db.get(`SELECT id FROM service_status WHERE name = ?`, [serviceName], (err, row) => {
        if (err || !row) {
            return callback(err || new Error('Service not found'));
        }

        db.run(
            `DELETE FROM manual_status WHERE service_id = ?`,
            [row.id],
            (deleteErr) => {
                if (deleteErr) {
                    console.error(`Error unsetting manual status for '${serviceName}':`, deleteErr.message);
                    return callback(deleteErr);
                }
                callback(null);
            }
        );
    });
};

const getManualStatus = (serviceName, callback) => {
    const query = `
        SELECT ms.manual_status, ms.description
        FROM manual_status ms
        JOIN service_status ss ON ms.service_id = ss.id
        WHERE ss.name = ?
    `;

    db.get(query, [serviceName], (err, row) => {
        if (err) {
            return callback(err, null);
        }

        if (!row) {
            return callback(null, null);
        }

        callback(null, row);
    });
};

const setNewIncident = (serviceName, title, description, severity, date, callback) => {
    db.get(`SELECT id FROM service_status WHERE name = ?`, [serviceName], (err, row) => {
        if (err || !row) {
            return callback(err || new Error('Service not found'));
        }

        db.run(
            `INSERT INTO incidents (service_id, title, description, severity, date) 
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(service_id) DO UPDATE SET 
             title = excluded.title, 
             description = excluded.description,
             severity = excluded.severity,
             date = excluded.date,
             updated_at = CURRENT_TIMESTAMP`,
            [row.id, title, description, severity, date],
            (insertErr) => {
                if (insertErr) {
                    console.error(`Error adding incident for '${serviceName}':`, insertErr.message);
                    return callback(insertErr);
                }
                callback(null);
            }
        );
    });
};

const getIncidents = (callback) => {
    db.all(
        `SELECT ss.name AS service, i.title, i.description, i.severity, i.date, i.updated_at 
         FROM incidents i
         JOIN service_status ss ON i.service_id = ss.id`, 
        [],
        (err, rows) => {
            if (err) {
                console.error('Error retrieving incidents:', err.message);
                return callback(err, null);
            }

            callback(null, rows);
        }
    );
};

const removeIncident = (title, serviceName, callback) => {
    db.get(
        `SELECT id FROM service_status WHERE name = ?`,
        [serviceName],
        (err, row) => {
            if (err || !row) {
                return callback(err || new Error('Service not found'));
            }

            db.run(
                `DELETE FROM incidents WHERE title = ? AND service_id = ?`,
                [title, row.id],
                (deleteErr) => {
                    if (deleteErr) {
                        console.error(`Error removing incident for service '${serviceName}' with title '${title}':`, deleteErr.message);
                        return callback(deleteErr);
                    }
                    callback(null);
                }
            );
        }
    );
};

const cleanupOldIncidents = () => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dateLimit = fourteenDaysAgo.toISOString().slice(0, 16).replace('T', ' ');
    
    db.run(
        `DELETE FROM incidents WHERE date < ?`,
        [dateLimit],
        (err) => {
            if (err) {
                console.error('Error cleaning up old incidents:', err.message);
            }
        }
    );
};
setInterval(cleanupOldIncidents, 24 * 60 * 60 * 1000);

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
    deleteAlert,
    setManualStatus,
    unsetManualStatus,
    getManualStatus,
    getServices,
    setNewIncident,
    removeIncident,
    getIncidents
};
