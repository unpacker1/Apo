// andro_full.js
// Termux için web panel + telefon kontrol (gelişmiş prototip)
// Eğitim ve kendi cihaz testleri amaçlıdır

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { exec } = require('child_process');
const ioClient = require('socket.io-client');

// ===== AYARLAR =====
const DEFAULT_PORT = 9400;
const PORT = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_PORT;
const ADMIN_TOKEN = crypto.randomBytes(16).toString('hex'); // basit token

// ===== VERİ DEPOSU =====
let clients = {}; // { socketId: { device_name, gps, logs } }

// ===== MIDDLEWARE =====
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'webpublic')));

// ===== ROUTES =====
app.get('/', (req, res) => {
    res.send(`<h2>Telefon Kontrol Paneli</h2>
    <p>Panel: <a href="/panel?token=${ADMIN_TOKEN}">/panel</a></p>
    <p>Port: ${PORT}</p>`);
});

// Token doğrulama
function checkToken(req, res, next){
    if(req.query.token === ADMIN_TOKEN) next();
    else res.status(401).send("Unauthorized");
}

app.get('/panel', checkToken, (req, res) => {
    let html = `<h2>Panel</h2><ul>`;
    for (let id in clients) {
        const c = clients[id];
        html += `<li>${c.device_name} - ID: ${id} - GPS: ${c.gps || 'N/A'} - Komut Log: ${c.logs?.join(', ') || 'Yok'}</li>`;
    }
    html += `</ul>`;
    html += `<p>Komut göndermek için socket.io kullan.</p>`;
    res.send(html);
});

// ===== SOCKET.IO SERVER =====
io.on('connection', socket => {
    console.log('Yeni bağlantı: ' + socket.id);

    // Telefon kayıt
    socket.on('register', data => {
        clients[socket.id] = { device_name: data.device_name, logs: [] };
        console.log('Telefon kayıt oldu:', data);
        io.emit('updateClients', clients);
    });

    // Komut gönderme
    socket.on('command', ({ targetId, command }) => {
        if (clients[targetId]) {
            io.to(targetId).emit('execute', command);
            clients[targetId].logs.push(command); // log
        }
    });

    // GPS güncelleme
    socket.on('gps', (location) => {
        if(clients[socket.id]) clients[socket.id].gps = location;
    });

    socket.on('disconnect', () => {
        delete clients[socket.id];
        io.emit('updateClients', clients);
        console.log('Telefon bağlantısı kesildi:', socket.id);
    });
});

// ===== CLIENT SIMÜLASYONU =====
const clientSocket = ioClient.connect(`http://localhost:${PORT}`);

clientSocket.on('connect', () => {
    console.log('Client servera bağlandı, ID:', clientSocket.id);
    clientSocket.emit('register', { device_name: 'Test Telefon' });

    // GPS simülasyonu
    setInterval(() => {
        const lat = (Math.random()*180-90).toFixed(5);
        const lng = (Math.random()*360-180).toFixed(5);
        clientSocket.emit('gps', `${lat}, ${lng}`);
    }, 10000);
});

clientSocket.on('execute', cmd => {
    console.log('Komut alındı:', cmd);
    // Termux komutu çalıştır
    exec(cmd, (err, stdout, stderr) => {
        if(stdout) console.log('STDOUT:', stdout);
        if(stderr) console.log('STDERR:', stderr);
    });
});

// ===== SERVER START =====
http.listen(PORT, () => console.log(`Web panel çalışıyor: http://127.0.0.1:${PORT}`));