// andro_termux_dynamic_port.js
// Web panel + telefon kontrol (port değişken, eğitim amaçlı)

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const bodyParser = require('body-parser');

// --- AYARLAR ---
const DEFAULT_PORT = 9400;

// Çalıştırırken terminalden port al
const PORT = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_PORT;

// --- VERİ DEPOSU ---
let clients = {}; // { socketId: { device_name } }

// --- MIDDLEWARE ---
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'webpublic')));

// --- ROUTES ---
app.get('/', (req, res) => {
    res.send(`<h2>Telefon Kontrol Paneli</h2><p>Panel için: <a href="/panel">/panel</a></p><p>Port: ${PORT}</p>`);
});

app.get('/panel', (req, res) => {
    let html = `<h2>Panel</h2><ul>`;
    for (let id in clients) html += `<li>${clients[id].device_name} - ID: ${id}</li>`;
    html += `</ul>`;
    html += `<p>Komut göndermek için socket.io kullan.</p>`;
    res.send(html);
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('Yeni bağlantı: ' + socket.id);

    // Telefon kayıt oluyor
    socket.on('register', (data) => {
        clients[socket.id] = data;
        console.log('Telefon kayıt oldu:', data);
        io.emit('updateClients', clients);
    });

    // Komut gönderme
    socket.on('command', ({ targetId, command }) => {
        if (clients[targetId]) {
            io.to(targetId).emit('execute', command);
        }
    });

    // Telefon disconnect
    socket.on('disconnect', () => {
        delete clients[socket.id];
        io.emit('updateClients', clients);
        console.log('Telefon bağlantısı kesildi:', socket.id);
    });
});

// --- CLIENT SIMÜLASYONU ---
const ioClient = require('socket.io-client');
const clientSocket = ioClient.connect(`http://localhost:${PORT}`);

clientSocket.on('connect', () => {
    console.log('Client servera bağlandı, ID:', clientSocket.id);
    clientSocket.emit('register', { device_name: 'Test Telefon' });
});

clientSocket.on('execute', (cmd) => {
    console.log('Komut alındı:', cmd);
    // Örnek: Termux terminal komutu çalıştırılabilir
    // const { exec } = require('child_process');
    // exec(cmd, (err, stdout, stderr) => { console.log(stdout); });
});

// --- SERVER START ---
http.listen(PORT, () => console.log(`Web panel çalışıyor: http://127.0.0.1:${PORT}`));