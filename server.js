const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));

// Fungsi untuk membaca traffic interface spesifik (dalam Bytes)
function getNetworkTraffic(interfaceName) {
    try {
        const data = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = data.split('\n');
        for (let line of lines) {
            if (line.includes(interfaceName)) {
                const parts = line.trim().split(/\s+/);
                // parts[1] = Received Bytes, parts[9] = Transmitted Bytes
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
    console.log("ℹ️ Info: '/proc/net/dev' tidak ditemukan. Mengaktifkan mode simulasi trafik otomatis (macOS/Development).");
} else {
    console.log(`🟢 Aktif: Memonitor interface '${networkInterface}' via '/proc/net/dev'.`);
}

let lastTraffic = hasProcNetDev ? getNetworkTraffic(networkInterface) : null;
let simTime = 0;

setInterval(() => {
    let rxSpeed = 0;
    let txSpeed = 0;

    if (hasProcNetDev) {
        const currentTraffic = getNetworkTraffic(networkInterface);
        
        // Hitung selisih untuk mendapatkan kecepatan per detik (dibagi 2 karena interval berjalan per 2 detik)
        // Wait, the client is updated every 2 seconds. Let's calculate the speed in Bytes per second:
        rxSpeed = (currentTraffic.rx - lastTraffic.rx) / 2;
        txSpeed = (currentTraffic.tx - lastTraffic.tx) / 2;
        
        // Jaga agar tidak negatif jika interface di-reset
        if (rxSpeed < 0) rxSpeed = 0;
        if (txSpeed < 0) txSpeed = 0;

        lastTraffic = currentTraffic;
    } else {
        // Mode simulasi dinamis dengan pola sinus + acak agar tampilan grafik memukau
        simTime += 0.15;
        const baseRx = 45 * 1024 * 1024; // 45 MB/s base
        const baseTx = 18 * 1024 * 1024; // 18 MB/s base
        
        const cycleRx = Math.sin(simTime) * 30 * 1024 * 1024;
        const cycleTx = Math.cos(simTime * 0.7) * 10 * 1024 * 1024;
        
        const noiseRx = (Math.random() - 0.5) * 8 * 1024 * 1024;
        const noiseTx = (Math.random() - 0.5) * 4 * 1024 * 1024;
        
        // Spikes acak sesekali
        const spikeRx = (Math.random() > 0.9) ? (Math.random() * 60 * 1024 * 1024) : 0;
        const spikeTx = (Math.random() > 0.93) ? (Math.random() * 25 * 1024 * 1024) : 0;
        
        rxSpeed = Math.max(1024, baseRx + cycleRx + noiseRx + spikeRx);
        txSpeed = Math.max(1024, baseTx + cycleTx + noiseTx + spikeTx);
    }

    // Kirim data (Bytes/s) beserta metadata ke browser
    io.emit('traffic-data', {
        rx: rxSpeed,
        tx: txSpeed,
        simulated: !hasProcNetDev,
        interface: hasProcNetDev ? networkInterface : 'Simulated (macOS)'
    });
}, 2000);

http.listen(3000, () => {
    console.log('Web nload berjalan di http://localhost:3000');
});
