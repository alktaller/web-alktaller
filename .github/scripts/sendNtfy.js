const fs = require('fs');
const https = require('https');

const DATA_PATH = 'data/car-data.json';

// Helper for https request
function sendNtfy(topic, title, message, priority, tags) {
    return new Promise((resolve, reject) => {
        // Encode title to avoid header issues with special chars
        const safeTitle = Buffer.from(title).toString('base64');
        
        const options = {
            hostname: 'ntfy.sh',
            port: 443,
            path: `/${topic}`,
            method: 'POST',
            headers: {
                // RFC 2047 encoding for headers
                'Title': `=?UTF-8?B?${safeTitle}?=`, 
                'Priority': priority,
                'Tags': tags || 'warning'
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
            } else {
                reject(new Error(`Status Code: ${res.statusCode}`));
            }
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(message || 'Alert');
        req.end();
    });
}

function calculateMaxOdometer(vehicle) {
    let max = 0;
    (vehicle.fuelEntries || []).forEach(e => { if(e.odometer > max) max = e.odometer; });
    (vehicle.maintenanceEntries || []).forEach(e => { if(e.odometer > max) max = e.odometer; });
    return max;
}

async function main() {
    if (!fs.existsSync(DATA_PATH)) {
        console.error("No data file found.");
        process.exit(0);
    }

    let data; 
    try {
        data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    } catch(e) {
        console.error("Error parsing data", e);
        process.exit(1);
    }
    
    // Check if ntfy is configured
    const topic = data.settings && data.settings.ntfyTopic;
    if (!topic) {
        console.log("No ntfy topic configured in data.settings.ntfyTopic. Skipping.");
        process.exit(0);
    }

    const today = new Date();
    
    if(!data.vehicles) return;

    for (const vehicle of data.vehicles) {
        if (!vehicle.reminders || vehicle.reminders.length === 0) continue;

        const currentOdometer = vehicle.currentOdometer || calculateMaxOdometer(vehicle);
        
        for (const r of vehicle.reminders) {
            let status = 'ok';
            let reasons = [];
            
            // 1. Find last completion Logic
            const matches = (vehicle.maintenanceEntries || []).filter(m => 
                m.maintType && r.title && m.maintType.toLowerCase().trim() === r.title.toLowerCase().trim()
            );
            
            let lastKm = 0;
            let lastDate = null;

            if(matches.length > 0) {
                matches.sort((a,b) => b.odometer - a.odometer);
                lastKm = matches[0].odometer;

                const timeMatches = [...matches].sort((a,b) => new Date(b.date) - new Date(a.date));
                lastDate = new Date(timeMatches[0].date);
            }

            // 2. Check KM
            if (r.type === 'km' || r.type === 'both' || (!r.type && r.intervalKm > 0)) { 
                if (r.intervalKm > 0) {
                    let dueKm = lastKm + Number(r.intervalKm);
                    let effectiveTargetKm = (r.targetKm !== undefined && r.targetKm !== null && r.targetKm !== "") ? Number(r.targetKm) : dueKm;
                    const remainingKm = effectiveTargetKm - currentOdometer;
                    
                    if (remainingKm < 0) {
                         status = 'danger';
                         reasons.push(`[KM] Pasado por ${Math.abs(remainingKm)} km`);
                    } else if (remainingKm < 1000) {
                         if (status !== 'danger') status = 'warning';
                         reasons.push(`[KM] Vence en ${remainingKm} km`);
                    }
                }
            }

            // 3. Check Date
            let monthsToAdd = 0;
            if(r.intervalMonths) monthsToAdd = r.intervalMonths;
            else if(r.intervalYears) monthsToAdd = r.intervalYears * 12;
            else if(r.intervalDays) monthsToAdd = r.intervalDays / 30;

            if (r.type === 'date' || r.type === 'both' || (!r.type && monthsToAdd > 0)) {
                let effectiveTargetDate = null;
                if (r.targetDate) {
                    effectiveTargetDate = new Date(r.targetDate);
                } else if (monthsToAdd > 0) {
                    if (!lastDate) {
                         status = 'danger';
                         reasons.push(`[Fecha] Nunca realizado`);
                    } else {
                        const d = new Date(lastDate);
                        d.setMonth(d.getMonth() + monthsToAdd);
                        effectiveTargetDate = d;
                    }
                }
                
                if (effectiveTargetDate) {
                    const diffTime = effectiveTargetDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays < 0) {
                        status = 'danger';
                        reasons.push(`[Fecha] Vencido hace ${Math.abs(diffDays)} días`);
                    } else if (diffDays < 30) {
                        if(status !== 'danger') status = 'warning';
                        reasons.push(`[Fecha] Vence en ${diffDays} días`);
                    }
                }
            }

            // 4. Send Notification
            if (status === 'danger' || status === 'warning') {
                const priority = status === 'danger' ? 'high' : 'default';
                const tags = status === 'danger' ? 'rotating_light' : 'warning';
                const titleStr = `${vehicle.plate || 'Coche'} - ${r.title}`;
                const bodyStr = `Estado: ${status.toUpperCase()}\n\n${reasons.join('\n')}`;

                console.log(`Sending notification to topic '${topic}': ${titleStr}`);
                
                try {
                    await sendNtfy(topic, titleStr, bodyStr, priority, tags);
                    console.log("Notification sent.");
                } catch(e) {
                    console.error("Failed to send notification:", e.message);
                }
            }
        }
    }
}

main().catch(console.error);
