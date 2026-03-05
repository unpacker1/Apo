// andro_full_single.js
// Termux için web panel + grafik + telefon kontrol (tek dosya prototip)
// Eğitim ve kendi cihaz testleri amaçlıdır

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const { exec } = require('child_process');

// ===== AYARLAR =====
const PORT = process.argv[2] ? parseInt(process.argv[2]) : 9400;
const ADMIN_TOKEN = Math.random().toString(36).slice(2);

// ===== VERİ DEPOSU =====
let clients = {}; // { socketId: { device_name, gps, logs } }

// ===== MIDDLEWARE =====
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.set('view engine', 'ejs');
app.set('views', __dirname);

// ===== ROUTES =====
app.get('/', (req, res) => {
    res.send(`<h2>Telefon Kontrol Paneli</h2>
    <p>Panel: <a href="/panel?token=${ADMIN_TOKEN}">/panel</a></p>
    <p>Port: ${PORT}</p>`);
});

function checkToken(req,res,next){
    if(req.query.token===ADMIN_TOKEN) next();
    else res.status(401).send("Unauthorized");
}

app.get('/panel', checkToken, (req,res)=>{
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Telefon Kontrol Paneli</title>
        <script src="/socket.io/socket.io.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body { font-family: Arial; margin: 20px; }
            #deviceList { margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <h2>Panel</h2>
        <div id="deviceList"></div>
        <canvas id="clientChart" width="400" height="200"></canvas>

        <script>
            const socket = io();
            let clients = ${JSON.stringify(clients)};

            function renderList(clients){
                let html = "<ul>";
                for(let id in clients){
                    html += '<li>'+clients[id].device_name+
                    ' - GPS: '+(clients[id].gps||'N/A')+
                    ' - Log: '+(clients[id].logs.length)+'</li>';
                }
                html += "</ul>";
                document.getElementById('deviceList').innerHTML = html;
            }

            renderList(clients);

            const ctx = document.getElementById('clientChart').getContext('2d');
            const chart = new Chart(ctx,{
                type:'bar',
                data:{
                    labels:Object.keys(clients),
                    datasets:[{
                        label:'Komut Sayısı',
                        data:Object.values(clients).map(c=>c.logs.length),
                        backgroundColor:'rgba(75,192,192,0.6)'
                    }]
                },
                options:{responsive:true, scales:{y:{beginAtZero:true}}}
            });

            socket.on('updateClients', data=>{
                clients=data;
                renderList(clients);
                chart.data.labels = Object.keys(clients);
                chart.data.datasets[0].data = Object.values(clients).map(c=>c.logs.length);
                chart.update();
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// ===== SOCKET.IO =====
io.on('connection', socket=>{
    console.log('Yeni bağlantı:', socket.id);

    socket.on('register', data=>{
        clients[socket.id]={ device_name:data.device_name, gps:null, logs:[] };
        io.emit('updateClients', clients);
    });

    socket.on('gps', gps=>{
        if(clients[socket.id]) clients[socket.id].gps=gps;
        io.emit('updateClients', clients);
    });

    socket.on('command', ({targetId, command})=>{
        if(clients[targetId]){
            io.to(targetId).emit('execute', command);
            clients[targetId].logs.push(command);
        }
    });

    socket.on('disconnect', ()=>{
        delete clients[socket.id];
        io.emit('updateClients', clients);
    });
});

// ===== CLIENT SIMÜLASYONU =====
const ioClient = require('socket.io-client');
const clientSocket = ioClient.connect(`http://localhost:${PORT}`);

clientSocket.on('connect', ()=>{
    console.log('Client servera bağlandı, ID:', clientSocket.id);
    clientSocket.emit('register',{device_name:'Test Telefon'});

    setInterval(()=>{
        const lat=(Math.random()*180-90).toFixed(5);
        const lng=(Math.random()*360-180).toFixed(5);
        clientSocket.emit('gps', `${lat}, ${lng}`);
    },10000);
});

clientSocket.on('execute', cmd=>{
    console.log('Komut alındı:', cmd);
    exec(cmd,(err,stdout,stderr)=>{
        if(stdout) console.log('STDOUT:',stdout);
        if(stderr) console.log('STDERR:',stderr);
    });
});

// ===== SERVER START =====
http.listen(PORT,()=>console.log(`Web panel çalışıyor: http://127.0.0.1:${PORT}`));