// ============================================================================
//  ESP32 + LD06 : pilotage du robot par Wi-Fi depuis un téléphone — version 1
//
//  Le robot crée son propre réseau Wi-Fi (pas besoin de box ni d'internet) :
//    réseau : Robot-LiDAR      mot de passe : lidar2026      page : http://192.168.4.1
//  Sur la page du téléphone :
//    - joystick pour piloter (le robot s'arrête dès qu'on lâche) + bouton STOP
//    - vue du LiDAR en direct
//    - « Capturer le scan » : arrête le robot, prend un tour complet, le garde dans le
//      téléphone ; chaque scan se télécharge en CSV (angle_deg,distance_mm,intensity)
//      qui se charge tel quel dans Lidar Lab.
//
//  Sécurité : si le robot ne reçoit plus d'ordre pendant 0,5 s (Wi-Fi coupé, page
//  fermée, téléphone en veille), les roues s'arrêtent toutes seules.
//
//  Câblage identique aux sketchs précédents : LiDAR TX -> GPIO33, PWM LiDAR -> GPIO32.
//  Nécessite le noyau ESP32 3.x (installé : 3.3.12) et la bibliothèque LD06.
// ============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include "ld06.h"

// ---------------- Wi-Fi ----------------
const char *AP_SSID = "Robot-LiDAR";
const char *AP_PASS = "lidar2026";  // 8 caractères minimum ; change-le si tu veux

// ---------------- LiDAR ----------------
#define RX_LIDAR      33
#define TX_LIDAR      -1
#define LD06_PWM_PIN  32
#define LIDAR_BAUD    230400
#define LIDAR_PWM_HZ  30000
int lidarPct = 40;  // ~40 % ≈ 10 Hz ; réglable depuis la page (plus bas = plus de points par tour)
LD06 ld06(Serial2, LD06_PWM_PIN);

// ---------------- Roues ----------------
struct Wheel {
  uint8_t pinForward;   // broche « avance »
  uint8_t pinBackward;  // broche « recule »
  bool inverted;        // true si la roue tourne à l'envers
  const char *name;
};
Wheel WHEELS[4] = {
  {18, 19, false, "avant gauche"},    // M2 : m2a (D18) avance, m2b (D19) recule
  { 5, 17, false, "avant droite"},    // M1 : m1b (D5)  avance, m1a (D17) recule
  {15,  2, false, "arriere gauche"},  // M3 : m3a (D15) avance, m3b (D2)  recule
  {16,  4, false, "arriere droite"},  // M4 : m4b (D16) avance, m4a (D4)  recule
};
#define MOTOR_PWM_HZ   20000  // au-dessus de l'audible
#define MOTOR_PWM_BITS 8      // 0 à 255
#define DEADMAN_MS     500    // arrêt automatique sans ordre récent

WebServer server(80);
unsigned long lastDriveMs = 0;
bool moving = false;

// ---------------- Copie du dernier tour complet ----------------
struct ScanPoint {
  uint16_t angle100;  // angle en centièmes de degré
  uint16_t distance;  // mm
  uint8_t intensity;  // 0-255
};
ScanPoint snap[LD06_MAX_PTS_SCAN];
uint16_t snapCount = 0;
uint32_t snapId = 0;
uint16_t snapSpeed = 0;  // °/s

// ============================================================================
//  Moteurs
// ============================================================================
void setWheel(const Wheel &w, int speed) {  // speed de -255 à 255
  if (w.inverted) speed = -speed;
  speed = constrain(speed, -255, 255);
  ledcWrite(w.pinForward, speed > 0 ? speed : 0);
  ledcWrite(w.pinBackward, speed < 0 ? -speed : 0);
}

// gauche = avant gauche + arrière gauche ; droite = avant droite + arrière droite
void drive(int left, int right) {
  setWheel(WHEELS[0], left);
  setWheel(WHEELS[2], left);
  setWheel(WHEELS[1], right);
  setWheel(WHEELS[3], right);
  moving = (left != 0 || right != 0);
}

void stopWheels() { drive(0, 0); }

void initWheels() {
  for (const Wheel &w : WHEELS) {
    for (uint8_t pin : {w.pinForward, w.pinBackward}) {
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);  // roues arrêtées tout de suite
      ledcAttach(pin, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
      ledcWrite(pin, 0);
    }
  }
}

void setLidarSpeed(int pct) {
  lidarPct = constrain(pct, 20, 60);
  ledcWrite(LD06_PWM_PIN, (uint32_t)lidarPct * 255 / 100);
}

// ============================================================================
//  Page du téléphone
// ============================================================================
const char PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Robot LiDAR</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;font:15px/1.4 system-ui,sans-serif;background:#10151e;color:#e8edf5;-webkit-user-select:none;user-select:none}
header{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #303b4b;position:sticky;top:0;background:#10151e;z-index:2}
h1{font-size:17px;margin:0}#st{font-size:13px}#st.ok{color:#71dfaa}#st.ko{color:#ff8b8b}
main{padding:12px 16px;display:grid;gap:12px;max-width:560px;margin:auto}
.card{background:#19212d;border:1px solid #303b4b;border-radius:12px;padding:10px}
canvas{display:block;width:100%;background:#0c1118;border-radius:8px;touch-action:none}
#lidar{aspect-ratio:1}#joy{aspect-ratio:1;max-width:260px;margin:0 auto}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
button{font:inherit;color:inherit;background:#233446;border:1px solid #3a4759;border-radius:9px;padding:12px 14px}
button:disabled{opacity:.5}
.stop{background:#8b2430;border-color:#c43b4a;font-weight:700;flex:1;font-size:18px}
.cap{background:#17685e;border-color:#248c7e;flex:1;font-weight:600}
label,.sub{font-size:13px;color:#9aabc0}input[type=range]{flex:1;min-width:120px}
#list a{display:block;color:#69d4c5;padding:6px 0;border-bottom:1px solid #303b4b;text-decoration:none}
</style></head><body>
<header><h1>Robot LiDAR</h1><span id="st" class="ko">connexion…</span></header>
<main>
<section class="card">
<canvas id="lidar"></canvas>
<div class="sub" id="info">En attente du LiDAR…</div>
<div class="row"><label>Portée affichée</label><input type="range" id="zoom" min="1" max="12" value="4"><span id="zv" class="sub">4 m</span></div>
<div class="row"><label><input type="checkbox" id="mirror"> Miroir gauche/droite</label></div>
</section>
<section class="card">
<canvas id="joy"></canvas>
<div class="row"><label>Vitesse max</label><input type="range" id="vmax" min="20" max="100" value="50"><span id="vv" class="sub">50 %</span></div>
<div class="row"><button class="stop" id="stop">STOP</button></div>
</section>
<section class="card">
<div class="row" style="margin:0"><button class="cap" id="cap">Capturer le scan (robot arrêté)</button></div>
<div class="sub" id="capst" style="margin-top:8px">Arrête le robot, capture, avance d’un petit pas, recommence. Garde des murs communs entre deux scans.</div>
<div class="row"><label>Rotation LiDAR</label><input type="range" id="lp" min="20" max="60" value="40"><span id="lpv" class="sub">40 %</span></div>
<div id="list"></div>
<div class="row"><button id="all">Tout télécharger</button><button id="clear">Effacer la liste</button></div>
</section>
</main>
<script>
const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let joy={x:0,y:0,active:false},scan=null,captures=[],stopsToSend=3,busyDrive=false,capturing=false;
try{captures=JSON.parse(localStorage.getItem('captures')||'[]')}catch(e){}
function status(ok,t){$('st').textContent=t;$('st').className=ok?'ok':'ko'}
async function get(url,ms=1500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,cache:'no-store'});if(!r.ok)throw new Error(r.status);return await r.text()}finally{clearTimeout(t)}}

// ---------- pilotage : ordres répétés tant qu'on touche le joystick ----------
function wheelSpeeds(){const dead=0.12,mag=Math.hypot(joy.x,joy.y);if(mag<dead)return[0,0];
 let l=joy.y+joy.x,r=joy.y-joy.x;const s=Math.max(1,Math.abs(l),Math.abs(r)),v=+$('vmax').value;
 return[Math.round(l/s*v),Math.round(r/s*v)]}
setInterval(async()=>{if(busyDrive)return;busyDrive=true;try{
 if(joy.active){const[l,r]=wheelSpeeds();await get('/drive?l='+l+'&r='+r,800)}
 else if(stopsToSend>0){stopsToSend--;await get('/stop',800)}}catch(e){}busyDrive=false},120);
function stopNow(){joy={x:0,y:0,active:false};stopsToSend=5;drawJoy();get('/stop',800).catch(()=>{})}
$('stop').onclick=stopNow;
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopNow()});
window.addEventListener('pagehide',stopNow);

const jc=$('joy'),jx=jc.getContext('2d');
function sizeCanvas(c){const r=c.getBoundingClientRect(),d=devicePixelRatio||1;if(c.width!==Math.round(r.width*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d)}return[c.width,c.height,d]}
function drawJoy(){const[w,h,d]=sizeCanvas(jc),R=w/2-14*d;jx.clearRect(0,0,w,h);
 jx.strokeStyle='#3a4759';jx.lineWidth=2*d;jx.beginPath();jx.arc(w/2,h/2,R,0,7);jx.stroke();
 jx.fillStyle='#9aabc0';jx.font=(12*d)+'px system-ui';jx.textAlign='center';
 jx.fillText('avant',w/2,h/2-R+16*d);jx.fillText('arrière',w/2,h/2+R-8*d);
 jx.fillStyle=joy.active?'#69d4c5':'#233446';jx.beginPath();jx.arc(w/2+joy.x*R,h/2-joy.y*R,26*d,0,7);jx.fill()}
function joyAt(e){const r=jc.getBoundingClientRect(),R=r.width/2-14;let x=(e.clientX-r.left-r.width/2)/R,y=-(e.clientY-r.top-r.height/2)/R;
 const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}joy.x=x;joy.y=y;drawJoy()}
jc.addEventListener('pointerdown',e=>{jc.setPointerCapture(e.pointerId);joy.active=true;joyAt(e)});
jc.addEventListener('pointermove',e=>{if(joy.active)joyAt(e)});
for(const ev of['pointerup','pointercancel','lostpointercapture'])jc.addEventListener(ev,()=>{if(joy.active)stopNow()});
$('vmax').oninput=()=>$('vv').textContent=$('vmax').value+' %';

// ---------- LiDAR en direct ----------
function parseScan(text){const lines=text.split('\n'),m=/id=(\d+).*hz=([\d.]+).*pts=(\d+).*pwm=(\d+)/.exec(lines[0]||'');
 const pts=[];for(const l of lines){if(!/^[\d.]/.test(l))continue;const c=l.split(',');pts.push([+c[0],+c[1]/1000,+c[2]])}
 return{text,id:m?+m[1]:-1,hz:m?+m[2]:0,pwm:m?+m[4]:0,pts}}
const lc=$('lidar'),lx=lc.getContext('2d');
function drawLidar(){const[w,h,d]=sizeCanvas(lc),cx=w/2,cy=h/2,range=+$('zoom').value,s=(w/2-6*d)/range,mir=$('mirror').checked?-1:1;
 lx.clearRect(0,0,w,h);lx.strokeStyle='#26313f';lx.lineWidth=d;
 for(let k=1;k<=range;k++){lx.beginPath();lx.arc(cx,cy,k*s,0,7);lx.stroke()}
 lx.fillStyle='#ffb86b';lx.beginPath();lx.moveTo(cx,cy-12*d);lx.lineTo(cx-7*d,cy+7*d);lx.lineTo(cx+7*d,cy+7*d);lx.fill();
 if(!scan)return;
 for(const[a,r,i]of scan.pts){if(r<0.05)continue;const t=a*Math.PI/180,x=r*Math.cos(t),y=r*Math.sin(t);
  lx.fillStyle=i<40?'#ff8b8b':i<120?'#ffde73':'#f4f7fb';lx.fillRect(cx-mir*y*s-1.5*d,cy-x*s-1.5*d,3*d,3*d)}}
$('zoom').oninput=()=>{$('zv').textContent=$('zoom').value+' m';drawLidar()};$('mirror').onchange=drawLidar;
addEventListener('resize',()=>{drawJoy();drawLidar()});
(async function poll(){for(;;){try{const s=parseScan(await get('/scan',2500));if(s.pts.length){scan=s;drawLidar();
  $('info').textContent=s.pts.length+' points · '+s.hz.toFixed(1)+' tours/s · tour n°'+s.id;
  if(document.activeElement!==$('lp')){$('lp').value=s.pwm;$('lpv').textContent=s.pwm+' %'}}
  status(true,'connecté')}catch(e){status(false,'robot injoignable')}await sleep(capturing?100:250)}})();
$('lp').onchange=()=>{$('lpv').textContent=$('lp').value+' %';get('/lidar?pct='+$('lp').value).catch(()=>{})};
$('lp').oninput=()=>$('lpv').textContent=$('lp').value+' %';

// ---------- captures ----------
function save(){try{localStorage.setItem('captures',JSON.stringify(captures))}catch(e){$('capst').textContent='Mémoire du navigateur pleine : télécharge puis efface la liste.'}}
function link(c){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c.text],{type:'text/csv'}));a.download=c.name;
 a.textContent='⬇ '+c.name+' · '+c.n+' points';return a}
function renderList(){const l=$('list');l.innerHTML='';captures.forEach(c=>l.append(link(c)))}
$('cap').onclick=async()=>{if(capturing)return;capturing=true;$('cap').disabled=true;stopNow();
 try{$('capst').textContent='Robot arrêté, attente de deux tours complets…';
  const start=scan?scan.id:-1,t0=Date.now();
  while((!scan||scan.id<start+2)&&Date.now()-t0<5000)await sleep(60);
  const s=parseScan(await get('/scan',3000));if(s.pts.length<50)throw new Error('scan vide');
  const n=captures.length+1,d=new Date(),hh=[d.getHours(),d.getMinutes(),d.getSeconds()].map(v=>String(v).padStart(2,'0')).join('-');
  captures.push({name:'robot_scan_'+String(n).padStart(2,'0')+'_'+hh+'.csv',text:s.text,n:s.pts.length});save();renderList();
  $('capst').textContent='Scan '+n+' gardé ('+s.pts.length+' points). Avance d’un petit pas puis capture le suivant.'}
 catch(e){$('capst').textContent='Capture impossible : '+e.message+'. Vérifie la connexion Wi-Fi.'}
 capturing=false;$('cap').disabled=false};
$('all').onclick=async()=>{for(const c of captures){link(c).click();await sleep(700)}};
$('clear').onclick=()=>{if(confirm('Effacer les '+captures.length+' scans gardés dans le téléphone ?')){captures=[];save();renderList()}};
renderList();drawJoy();drawLidar();
</script></body></html>)HTML";

// ============================================================================
//  Serveur web
// ============================================================================
void handlePage() { server.send(200, "text/html; charset=utf-8", PAGE); }

void handleDrive() {
  int l = constrain(server.arg("l").toInt(), -100, 100);
  int r = constrain(server.arg("r").toInt(), -100, 100);
  drive(l * 255 / 100, r * 255 / 100);
  lastDriveMs = millis();
  server.send(200, "text/plain", "ok");
}

void handleStop() {
  stopWheels();
  server.send(200, "text/plain", "ok");
}

void handleLidar() {
  if (server.hasArg("pct")) setLidarSpeed(server.arg("pct").toInt());
  server.send(200, "text/plain", String(lidarPct));
}

// Dernier tour complet, au format CSV de Lidar Lab (une ligne # d'information en tête)
void handleScan() {
  String out;
  out.reserve(snapCount * 16 + 160);
  out += "# robot_wifi id=" + String(snapId) + " hz=" + String(snapSpeed / 360.0f, 1) + " pts=" + String(snapCount) + " pwm=" + String(lidarPct) + "\n";
  out += "angle_deg,distance_mm,intensity\n";
  char line[32];
  for (uint16_t i = 0; i < snapCount; i++) {
    snprintf(line, sizeof line, "%.2f,%u,%u\n", snap[i].angle100 / 100.0f, snap[i].distance, snap[i].intensity);
    out += line;
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");  // lisible aussi depuis Lidar Lab sur le PC
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/csv", out);
}

// ============================================================================
void setup() {
  initWheels();  // en tout premier : roues arrêtées
  Serial.begin(115200);

  Serial2.setRxBufferSize(4096);
  Serial2.begin(LIDAR_BAUD, SERIAL_8N1, RX_LIDAR, TX_LIDAR);
  Serial2.setTimeout(10);
  ld06.init();  // met GPIO32 à HIGH, puis on applique notre PWM
  ledcAttach(LD06_PWM_PIN, LIDAR_PWM_HZ, 8);
  setLidarSpeed(lidarPct);
  ld06.enableCRC();
  ld06.enableFullScan();
  ld06.disableFiltering();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  WiFi.setSleep(false);  // réponse plus rapide aux ordres

  server.on("/", handlePage);
  server.on("/drive", handleDrive);
  server.on("/stop", handleStop);
  server.on("/scan", handleScan);
  server.on("/lidar", handleLidar);
  server.on("/favicon.ico", [] { server.send(204); });
  server.onNotFound([] { server.send(404, "text/plain", "introuvable"); });
  server.begin();

  Serial.print("Wi-Fi « ");
  Serial.print(AP_SSID);
  Serial.print(" » prêt. Ouvre http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();

  if (ld06.readScan()) {  // nouveau tour complet : on en garde une copie pour /scan
    uint16_t n = min<uint16_t>(ld06.getNbPointsInScan(), LD06_MAX_PTS_SCAN);
    for (uint16_t i = 0; i < n; i++) {
      DataPoint *p = ld06.getPoints(i);
      snap[i] = {(uint16_t)(p->angle * 100.0f + 0.5f), p->distance, p->intensity};
    }
    snapCount = n;
    snapSpeed = ld06.getSpeed();
    snapId++;
  }

  // sécurité : plus d'ordre reçu -> arrêt
  if (moving && millis() - lastDriveMs > DEADMAN_MS) stopWheels();
}
