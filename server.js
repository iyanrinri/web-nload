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

let lastTraffic = getNetworkTraffic('enp65s0f1'); // Ganti dengan nama interfacemu

setInterval(() => {
    const currentTraffic = getNetworkTraffic('enp65s0f1');
    
    // Hitung selisih untuk mendapatkan kecepatan per detik (dalam Bytes/s)
    const rxSpeed = currentTraffic.rx - lastTraffic.rx;
    const txSpeed = currentTraffic.tx - lastTraffic.tx;

    lastTraffic = currentTraffic;

    // Kirim data MENTAH (Bytes) ke browser
    io.emit('traffic-data', {
        rx: rxSpeed,
        tx: txSpeed
    });
}, 2000);

http.listen(3000, () => {
    console.log('Web nload berjalan di http://localhost:3000');
});
