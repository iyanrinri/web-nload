const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const os = require('os');

app.use(express.static('public'));

// ==================== SERVER-SIDE HISTORY ====================

// In-memory traffic history (stores up to 24 h of data points)
let trafficHistory = [];

// Prune entries older than 24 hours
function pruneHistory() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    trafficHistory = trafficHistory.filter(entry => entry.t >= cutoff);
}

// Schedule automatic midnight reset (server-local timezone)
function scheduleMidnightReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow - now;

    setTimeout(() => {
        console.log('🌅 Midnight reset: Menghapus riwayat traffic.');
        trafficHistory = [];
        // Recurring reset every 24 h
        setInterval(() => {
            console.log('🌅 Midnight reset: Menghapus riwayat traffic.');
            trafficHistory = [];
        }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    const mins = Math.round(msUntilMidnight / 60000);
    console.log(`⏰ Reset tengah malam dijadwalkan dalam ${mins} menit.`);
}

scheduleMidnightReset();

// ==================== NETWORK TRAFFIC READING ====================

// Read traffic counters from /proc/net/dev (Linux only, in Bytes)
function getNetworkTraffic(interfaceName) {
    try {
        const data = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = data.split('\n');
        for (let line of lines) {
            if (line.includes(interfaceName)) {
                const parts = line.trim().split(/\s+/);
                return {
                    rx: parseInt(parts[1]),
                    tx: parseInt(parts[9])
                };
            }
        }
    } catch (err) {
        console.error("Gagal membaca data network:", err);
    }
    return { rx: 0, tx: 0 };
}

const hasProcNetDev = fs.existsSync('/proc/net/dev');
const networkInterface = 'enp65s0f1'; // Ganti dengan nama interfacemu

if (!hasProcNetDev) {
    console.log("ℹ️ '/proc/net/dev' tidak ditemukan. Mode simulasi aktif (macOS/Dev).");
} else {
    console.log(`🟢 Memonitor interface '${networkInterface}'.`);
}

let lastTraffic = hasProcNetDev ? getNetworkTraffic(networkInterface) : null;
let simTime = 0;
let tickCount = 0;

// ==================== DATA COLLECTION INTERVAL (every 2 s) ====================

setInterval(() => {
    let rxSpeed = 0;
    let txSpeed = 0;

    if (hasProcNetDev) {
        const currentTraffic = getNetworkTraffic(networkInterface);
        rxSpeed = (currentTraffic.rx - lastTraffic.rx) / 2;
        txSpeed = (currentTraffic.tx - lastTraffic.tx) / 2;
        if (rxSpeed < 0) rxSpeed = 0;
        if (txSpeed < 0) txSpeed = 0;
        lastTraffic = currentTraffic;
    } else {
        // Simulated dynamic traffic with sine waves + random noise
        simTime += 0.15;
        const baseRx = 45 * 1024 * 1024;
        const baseTx = 18 * 1024 * 1024;
        const cycleRx = Math.sin(simTime) * 30 * 1024 * 1024;
        const cycleTx = Math.cos(simTime * 0.7) * 10 * 1024 * 1024;
        const noiseRx = (Math.random() - 0.5) * 8 * 1024 * 1024;
        const noiseTx = (Math.random() - 0.5) * 4 * 1024 * 1024;
        const spikeRx = Math.random() > 0.9 ? Math.random() * 60 * 1024 * 1024 : 0;
        const spikeTx = Math.random() > 0.93 ? Math.random() * 25 * 1024 * 1024 : 0;
        rxSpeed = Math.max(1024, baseRx + cycleRx + noiseRx + spikeRx);
        txSpeed = Math.max(1024, baseTx + cycleTx + noiseTx + spikeTx);
    }

    const now = Date.now();

    // Store in server-side history
    trafficHistory.push({ t: now, rx: rxSpeed, tx: txSpeed });

    // Prune old entries every ~60 seconds (30 ticks × 2 s)
    tickCount++;
    if (tickCount % 30 === 0) {
        pruneHistory();
    }

    // Emit live data to all connected clients
    io.emit('traffic-data', {
        rx: rxSpeed,
        tx: txSpeed,
        timestamp: now,
        simulated: !hasProcNetDev,
        interface: hasProcNetDev ? networkInterface : 'Simulated (macOS)',
        loadAvg: os.loadavg()
    });
}, 2000);

// ==================== SOCKET.IO CONNECTION HANDLING ====================

io.on('connection', (socket) => {
    console.log('👤 Client terhubung');

    // Client requests history for a specific time range
    socket.on('request-history', (data) => {
        const rangeMs = data && data.rangeMs ? data.rangeMs : 5 * 60 * 1000;
        const cutoff = Date.now() - rangeMs;
        const filtered = trafficHistory.filter(entry => entry.t >= cutoff);
        socket.emit('history-data', { range: data.range || '5m', points: filtered });
    });

    socket.on('disconnect', () => {
        console.log('👤 Client terputus');
    });
});

// ==================== START SERVER ====================

http.listen(3000, () => {
    console.log('Web nload berjalan di http://localhost:3000');
});
