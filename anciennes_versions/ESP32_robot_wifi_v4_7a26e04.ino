// ============================================================================
//  ESP32 + LD06 : pilotage Wi-Fi, grid map automatique, liaison avec Lidar Lab sur le PC — version 4
//
//  Nouveauté de la v4 : quand le serveur Lidar Lab tourne sur le PC (node serveur_robot/serveur.js,
//  PC connecté au Wi-Fi Robot-LiDAR), il se signale au robot toutes les 3 s (/register).
//  Le téléphone qui ouvre http://192.168.4.1 est alors renvoyé vers la version reliée au PC :
//  les scans y sont enregistrés sur l'ordinateur et apparaissent aussi dans Lidar Lab.
//  Sans PC, la page autonome de la v3 reste disponible.
//
//  Réseau : Robot-LiDAR      mot de passe : lidar2026      page : http://192.168.4.1
//
//  Nouveauté de la v3 : la carte se construit automatiquement SUR LE TÉLÉPHONE.
//    Chaque scan capturé est recalé sur les scans précédents puis ajouté à la grid map,
//    avec EXACTEMENT les calculs de Lidar Lab : l'ESP32 sert au téléphone une copie de
//    lidar_core.js (fichier lidar_core_js.h, régénéré par « node genere_lidar_core_h.js »).
//    Exports depuis le téléphone : grid_map.csv, grid MapTool, poses.json, scans CSV.
//
//  Reprend la v2 :
//    - démarrage / arrêt progressifs (rampe dans l'ESP32) ; le bouton STOP reste immédiat
//    - virages adoucis (vitesse de virage réglable, joystick plus fin au centre)
//    - puissance minimale de démarrage (le moteur bouge dès qu'on touche le joystick)
//    - boutons « tourner de 15° / 45° » à gauche et à droite (rotation chronométrée)
//    - après chaque rotation, la page MESURE l'angle tourné avec le LiDAR et propose
//      de corriger le réglage (ms par degré), enregistré dans l'ESP32
//
//  Sécurité : sans ordre depuis 0,5 s, le robot ralentit et s'arrête tout seul.
//  Câblage : LiDAR TX -> GPIO33, PWM LiDAR -> GPIO32. Noyau ESP32 3.x, bibliothèque LD06.
// ============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "ld06.h"
#include "lidar_core_js.h"  // calculs de Lidar Lab (lidar_core.js) servis au téléphone

// ---------------- Wi-Fi ----------------
const char *AP_SSID = "Robot-LiDAR";
const char *AP_PASS = "lidar2026";  // 8 caractères minimum

// ---------------- LiDAR ----------------
#define RX_LIDAR      33
#define TX_LIDAR      -1
#define LD06_PWM_PIN  32
#define LIDAR_BAUD    230400
#define LIDAR_PWM_HZ  30000
int lidarPct = 40;  // ~40 % ≈ 10 Hz
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
#define MOTOR_PWM_HZ   20000
#define MOTOR_PWM_BITS 8
#define DEADMAN_MS     500

// ---------------- Douceur ----------------
#define RAMP_UP_MS     400   // 0 -> pleine vitesse en 0,4 s (joystick)
#define RAMP_DOWN_MS   250   // pleine vitesse -> 0 en 0,25 s (lâcher, sécurité)
#define RAMP_TURN_MS   120   // rampe des rotations chronométrées
#define TURN_SPEED     110   // vitesse des rotations chronométrées (0-255, avant puissance mini)

// Réglages enregistrés dans l'ESP32 (modifiables depuis la page)
Preferences prefs;
float msPerDeg = 11.0f;  // durée de rotation par degré à TURN_SPEED (à calibrer)
uint8_t minPwm = 60;     // puissance minimale quand une roue doit tourner (0-255)

WebServer server(80);

// ---------------- PC (serveur Lidar Lab) ----------------
IPAddress pcIp;
uint16_t pcPort = 0;
unsigned long pcSeenMs = 0;
bool pcPresent() { return pcPort && millis() - pcSeenMs < 10000; }

// Vitesses « logiques » de -255 à 255 : consigne et valeur actuelle (après rampe)
float targetL = 0, targetR = 0, curL = 0, curR = 0;
unsigned long lastDriveMs = 0, lastRampUs = 0, turnEndMs = 0;
bool turning = false;

// ---------------- Copie du dernier tour complet ----------------
struct ScanPoint {
  uint16_t angle100;
  uint16_t distance;
  uint8_t intensity;
};
ScanPoint snap[LD06_MAX_PTS_SCAN];
uint16_t snapCount = 0;
uint32_t snapId = 0;
uint16_t snapSpeed = 0;

// ============================================================================
//  Moteurs
// ============================================================================
// vitesse logique -> PWM : 0 reste 0, sinon on part de minPwm pour vaincre les frottements
uint32_t toPwm(float s) {
  float a = fabsf(s);
  if (a < 1.0f) return 0;
  return (uint32_t)(minPwm + a * (255 - minPwm) / 255.0f + 0.5f);
}

void setWheel(const Wheel &w, float speed) {
  if (w.inverted) speed = -speed;
  uint32_t pwm = toPwm(speed);
  ledcWrite(w.pinForward, speed > 0 ? pwm : 0);
  ledcWrite(w.pinBackward, speed < 0 ? pwm : 0);
}

void applyWheels() {
  setWheel(WHEELS[0], curL);
  setWheel(WHEELS[2], curL);
  setWheel(WHEELS[1], curR);
  setWheel(WHEELS[3], curR);
}

void stopNow() {  // arrêt immédiat, sans rampe
  targetL = targetR = curL = curR = 0;
  turning = false;
  applyWheels();
}

float approach(float cur, float target, float dtMs) {
  float rampMs = turning ? RAMP_TURN_MS : (fabsf(target) > fabsf(cur) && target * cur >= 0 ? RAMP_UP_MS : RAMP_DOWN_MS);
  float step = 255.0f * dtMs / rampMs;
  if (target > cur) return min(target, cur + step);
  return max(target, cur - step);
}

void updateMotion() {
  unsigned long now = micros();
  float dtMs = (now - lastRampUs) / 1000.0f;
  if (dtMs < 5) return;  // mise à jour toutes les 5 ms
  lastRampUs = now;
  if (turning && (long)(millis() - turnEndMs) >= 0) {
    targetL = targetR = 0;  // fin de la rotation chronométrée (puis rampe d'arrêt)
    if (curL == 0 && curR == 0) turning = false;
  }
  if (!turning && (targetL != 0 || targetR != 0) && millis() - lastDriveMs > DEADMAN_MS) targetL = targetR = 0;
  float nl = approach(curL, targetL, dtMs), nr = approach(curR, targetR, dtMs);
  if (nl != curL || nr != curR) {
    curL = nl;
    curR = nr;
    applyWheels();
  }
}

void initWheels() {
  for (const Wheel &w : WHEELS) {
    for (uint8_t pin : {w.pinForward, w.pinBackward}) {
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);
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
:root{color-scheme:dark}*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;font:15px/1.4 system-ui,sans-serif;background:#10151e;color:#e8edf5;-webkit-user-select:none;user-select:none}
header{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #303b4b;position:sticky;top:0;background:#10151e;z-index:2}
h1{font-size:17px;margin:0}#st{font-size:13px}#st.ok{color:#71dfaa}#st.ko{color:#ff8b8b}
main{padding:12px 16px;display:grid;gap:12px;max-width:560px;margin:auto}
.card{background:#19212d;border:1px solid #303b4b;border-radius:12px;padding:10px}
h2{font-size:14px;margin:0 0 6px;color:#9aabc0;font-weight:600}
canvas{display:block;width:100%;background:#0c1118;border-radius:8px;touch-action:none}
#lidar{aspect-ratio:1}#joy{aspect-ratio:1;max-width:240px;margin:0 auto}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
.turns{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
button{font:inherit;color:inherit;background:#233446;border:1px solid #3a4759;border-radius:9px;padding:12px 10px}
button:disabled{opacity:.45}
.stop{background:#8b2430;border-color:#c43b4a;font-weight:700;flex:1;font-size:18px}
.cap{background:#17685e;border-color:#248c7e;flex:1;font-weight:600}
label,.sub{font-size:13px;color:#9aabc0}input[type=range]{flex:1;min-width:110px}
.val{font-size:13px;color:#e8edf5;min-width:52px;text-align:right}
#list a{display:block;color:#69d4c5;padding:6px 0;border-bottom:1px solid #303b4b;text-decoration:none}
#turnres{margin-top:8px}
#map{aspect-ratio:1}.num{width:76px;font:inherit;color:inherit;background:#111822;border:1px solid #3a4759;border-radius:7px;padding:8px}
.scanrow{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #303b4b;font-size:13px}.scanrow .ok{color:#71dfaa}.scanrow .ko{color:#ff8b8b}.scanrow button{padding:6px 10px;font-size:13px}
</style></head><body>
<header><h1>Robot LiDAR</h1><span id="st" class="ko">connexion…</span></header>
<main>
<section class="card" id="pcbox" hidden style="border-color:#248c7e">
<h2 style="color:#71dfaa">Lidar Lab (PC) est connecté</h2>
<div class="sub">Les scans seront enregistrés sur l’ordinateur et apparaîtront aussi dans Lidar Lab.</div>
<div class="row"><a id="pclink" href="#"><button class="cap" type="button">Ouvrir la version reliée au PC</button></a><button id="pcstay" type="button">Rester ici</button></div>
<div class="sub" id="pccount"></div>
</section>
<section class="card">
<canvas id="lidar"></canvas>
<div class="sub" id="info">En attente du LiDAR…</div>
<div class="row"><label>Portée affichée</label><input type="range" id="zoom" min="1" max="12" value="4"><span id="zv" class="val">4 m</span></div>
<div class="row"><label><input type="checkbox" id="mirror"> Miroir gauche/droite</label></div>
</section>

<section class="card">
<h2>Pilotage</h2>
<canvas id="joy"></canvas>
<div class="row"><button class="stop" id="stop">STOP</button></div>
<div class="row"><label>Vitesse max</label><input type="range" id="vmax" min="20" max="100" value="45"><span id="vv" class="val">45 %</span></div>
<div class="row"><label>Vitesse de virage</label><input type="range" id="vturn" min="20" max="100" value="50"><span id="vt" class="val">50 %</span></div>
</section>

<section class="card">
<h2>Tourner sur place</h2>
<div class="turns"><button data-deg="45">⟲ 45°</button><button data-deg="15">⟲ 15°</button><button data-deg="-15">15° ⟳</button><button data-deg="-45">45° ⟳</button></div>
<div class="sub" id="turnres">Après chaque rotation, l’angle réel est mesuré avec le LiDAR (salle avec des murs visibles).</div>
<div class="row" id="fixrow" hidden><button id="fix">Corriger le réglage</button></div>
</section>

<section class="card">
<h2>Carte automatique (grid map)</h2>
<canvas id="map"></canvas>
<div class="sub" id="mapinfo">Capture un premier scan : il devient l’origine (0, 0, 0°) de la carte.</div>
<div class="row"><button class="cap" id="cap">Capturer et ajouter à la carte</button></div>
<div class="sub" id="capst" style="margin-top:8px">Arrête-toi, capture, avance d’un petit pas (30–50 cm) ou tourne de 15–45°, recommence. Chaque scan doit revoir des murs déjà cartographiés.</div>
<div class="row"><button id="undo">Annuler le dernier scan</button><button id="relocate">Recalculer les poses</button></div>
<div id="list"></div>
<div class="row"><button id="expgrid">grid_map.csv</button><button id="expmt">grid MapTool</button><button id="expposes">poses.json</button><button id="all">Scans CSV</button></div>
<div class="row"><button id="clear">Nouvelle carte</button></div>
</section>

<section class="card">
<h2>Réglages de la carte (comme Lidar Lab)</h2>
<div class="row"><label>Pas de grille (m)</label><input type="number" id="gres" class="num" value="0.05" min="0.02" max="0.25" step="0.01"></div>
<div class="row"><label>Portée min / max (m)</label><input type="number" id="rmin" class="num" value="0.05" min="0" step="0.05"><input type="number" id="rmax" class="num" value="12" min="0.5" max="12" step="0.5"></div>
<div class="row"><label>Intensité min (0–255)</label><input type="number" id="imin" class="num" value="0" min="0" max="255"></div>
<div class="row"><label>Recouvrement min (%)</label><input type="number" id="ovl" class="num" value="35" min="5" max="100" step="5"></div>
<div class="row"><label><input type="checkbox" id="tfilt" checked> Filtre temporel (masque ce qui bouge)</label></div>
<div class="sub">Ces réglages changent l’affichage et les exports tout de suite ; « Recalculer les poses » les applique aussi aux recalages.</div>
</section>

<section class="card">
<h2>Réglages du robot (enregistrés dans l’ESP32)</h2>
<div class="row"><label>Puissance de démarrage</label><input type="range" id="minpwm" min="0" max="140" value="60"><span id="mpv" class="val">60</span></div>
<div class="row"><label>Rotation : ms par degré</label><input type="number" id="mspd" step="0.1" min="1" max="100" value="11" style="width:90px;font:inherit;color:inherit;background:#111822;border:1px solid #3a4759;border-radius:7px;padding:8px"><button id="savecfg">Enregistrer</button></div>
<div class="row"><label>Rotation LiDAR</label><input type="range" id="lp" min="20" max="60" value="40"><span id="lpv" class="val">40 %</span></div>
<div class="sub">Puissance de démarrage : monte-la si une roue ne bouge pas au début du joystick, baisse-la si le robot démarre d’un coup.</div>
</section>
</main>
<script src="/lidar_core.js"></script>
<script>
const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let joy={x:0,y:0,active:false},scan=null,stopsToSend=3,busyDrive=false,busy=false,pendingFix=null;
function status(ok,t){$('st').textContent=t;$('st').className=ok?'ok':'ko'}
async function get(url,ms=1500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,cache:'no-store'});if(!r.ok)throw new Error('erreur '+r.status);return await r.text()}finally{clearTimeout(t)}}
var setBusy=function(b){busy=b;document.querySelectorAll('[data-deg],#cap').forEach(x=>x.disabled=b)};

// ---------- pilotage ----------
// courbe « expo » : plus fin près du centre ; le virage est réduit par « Vitesse de virage »
const expo=v=>Math.sign(v)*Math.pow(Math.abs(v),1.7);
function wheelSpeeds(){if(Math.hypot(joy.x,joy.y)<0.1)return[0,0];
 const y=expo(joy.y),x=expo(joy.x)*$('vturn').value/100;let l=y+x,r=y-x;
 const s=Math.max(1,Math.abs(l),Math.abs(r)),v=+$('vmax').value;return[Math.round(l/s*v),Math.round(r/s*v)]}
setInterval(async()=>{if(busyDrive)return;busyDrive=true;try{
 if(joy.active){const[l,r]=wheelSpeeds();await get('/drive?l='+l+'&r='+r,800)}
 else if(stopsToSend>0){stopsToSend--;await get('/release',800)}}catch(e){}busyDrive=false},120);
function release(){joy={x:0,y:0,active:false};stopsToSend=3;drawJoy()}      // lâcher : arrêt progressif
function stopNow(){joy={x:0,y:0,active:false};stopsToSend=0;drawJoy();return get('/stop',800).catch(()=>{})} // STOP : immédiat
$('stop').onclick=stopNow;
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopNow()});
addEventListener('pagehide',stopNow);

const jc=$('joy'),jx=jc.getContext('2d');
function sizeCanvas(c){const r=c.getBoundingClientRect(),d=devicePixelRatio||1;if(c.width!==Math.round(r.width*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d)}return[c.width,c.height,d]}
function drawJoy(){const[w,h,d]=sizeCanvas(jc),R=w/2-14*d;jx.clearRect(0,0,w,h);
 jx.strokeStyle='#3a4759';jx.lineWidth=2*d;jx.beginPath();jx.arc(w/2,h/2,R,0,7);jx.stroke();
 jx.beginPath();jx.arc(w/2,h/2,R*0.1,0,7);jx.stroke();
 jx.fillStyle='#9aabc0';jx.font=(12*d)+'px system-ui';jx.textAlign='center';
 jx.fillText('avant',w/2,h/2-R+16*d);jx.fillText('arrière',w/2,h/2+R-8*d);
 jx.fillStyle=joy.active?'#69d4c5':'#233446';jx.beginPath();jx.arc(w/2+joy.x*R,h/2-joy.y*R,24*d,0,7);jx.fill()}
function joyAt(e){const r=jc.getBoundingClientRect(),R=r.width/2-14;let x=(e.clientX-r.left-r.width/2)/R,y=-(e.clientY-r.top-r.height/2)/R;
 const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}joy.x=x;joy.y=y;drawJoy()}
jc.addEventListener('pointerdown',e=>{if(busy)return;jc.setPointerCapture(e.pointerId);joy.active=true;joyAt(e)});
jc.addEventListener('pointermove',e=>{if(joy.active)joyAt(e)});
for(const ev of['pointerup','pointercancel','lostpointercapture'])jc.addEventListener(ev,()=>{if(joy.active)release()});
for(const[id,out,suf]of[['vmax','vv',' %'],['vturn','vt',' %'],['minpwm','mpv',''],['lp','lpv',' %'],['zoom','zv',' m']])
 $(id).addEventListener('input',()=>$(out).textContent=$(id).value+suf);

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
$('zoom').addEventListener('input',drawLidar);$('mirror').onchange=drawLidar;
addEventListener('resize',()=>{drawJoy();drawLidar()});
(async function poll(){for(;;){try{const s=parseScan(await get('/scan',2500));if(s.pts.length){scan=s;drawLidar();
  $('info').textContent=s.pts.length+' points · '+s.hz.toFixed(1)+' tours/s · tour n°'+s.id;
  if(document.activeElement!==$('lp')){$('lp').value=s.pwm;$('lpv').textContent=s.pwm+' %'}}
  status(true,'connecté')}catch(e){status(false,'robot injoignable')}await sleep(busy?80:250)}})();
async function freshScan(n,timeout=5000){const id0=scan?scan.id:-1,t0=Date.now();
 while((!scan||scan.id<id0+n)&&Date.now()-t0<timeout)await sleep(50);
 if(!scan||scan.id<id0+n)throw new Error('pas de nouveau tour du LiDAR');return scan}

// ---------- rotation chronométrée + mesure de l'angle par le LiDAR ----------
// profil distance(angle) au degré près ; l'angle tourné est le décalage qui superpose les deux profils
function profile(s){const p=new Float32Array(360).fill(NaN);for(const[a,r]of s.pts){if(r<0.1)continue;const b=((Math.round(a)%360)+360)%360;if(!(p[b]<=r))p[b]=r}return p}
function measureRotation(A,B){const pa=profile(A),pb=profile(B);let best=null,costs={};
 for(let s=-120;s<=120;s++){let sum=0,n=0;for(let t=0;t<360;t++){const a=pa[t],b=pb[(((t-s)%360)+360)%360];
  if(a===a&&b===b){sum+=Math.min(0.5,Math.abs(a-b));n++}}
  if(n<60)continue;const c=sum/n;costs[s]=c;if(!best||c<best.c)best={s,c}}
 if(!best)return null;const l=costs[best.s-1],r=costs[best.s+1];let off=0;
 if(l!==undefined&&r!==undefined&&l+r-2*best.c>1e-9)off=0.5*(l-r)/(l+r-2*best.c);
 return{deg:best.s+off,err:best.c}}
document.querySelectorAll('[data-deg]').forEach(b=>b.onclick=async()=>{if(busy)return;setBusy(true);const deg=+b.dataset.deg;$('fixrow').hidden=true;
 try{await stopNow();$('turnres').textContent='Arrêt, scan de départ…';const A=await freshScan(2);
  const ms=+(await get('/turn?deg='+deg,1500));$('turnres').textContent='Rotation de '+Math.abs(deg)+'° en cours…';
  await sleep(ms+RAMP_WAIT);const B=await freshScan(2);const m=measureRotation(A,B);
  if(!m||m.err>0.15){$('turnres').textContent='Rotation faite ('+ms+' ms). Mesure LiDAR impossible (pas assez de murs, ou robot déplacé).';return}
  const same=Math.sign(m.deg)===Math.sign(deg),abs=Math.abs(m.deg);
  let t='Demandé '+Math.abs(deg)+'° '+(deg>0?'à gauche':'à droite')+' · mesuré par le LiDAR : '+abs.toFixed(1)+'°';
  if(!same&&abs>3)t+=' (le LiDAR voit le sens opposé : soit le robot a tourné à l’envers, soit les angles du LiDAR sont en sens horaire)';
  $('turnres').textContent=t;
  if(abs>3&&Math.abs(abs-Math.abs(deg))>1){pendingFix=+$('mspd').value*Math.abs(deg)/abs;$('fix').textContent='Corriger le réglage : '+$('mspd').value+' → '+pendingFix.toFixed(1)+' ms/°';$('fixrow').hidden=false}}
 catch(e){$('turnres').textContent='Rotation impossible : '+e.message}finally{setBusy(false)}});
const RAMP_WAIT=600;
$('fix').onclick=async()=>{if(pendingFix===null)return;$('mspd').value=pendingFix.toFixed(1);await saveCfg();$('fixrow').hidden=true;pendingFix=null};

// ---------- réglages ----------
async function loadCfg(){try{const c=JSON.parse(await get('/config'));$('mspd').value=c.mspd;$('minpwm').value=c.minpwm;$('mpv').textContent=c.minpwm}catch(e){setTimeout(loadCfg,1500)}}
async function saveCfg(){try{await get('/config?mspd='+$('mspd').value+'&minpwm='+$('minpwm').value);$('turnres').textContent='Réglages enregistrés dans le robot.'}catch(e){$('turnres').textContent='Enregistrement impossible : '+e.message}}
$('savecfg').onclick=saveCfg;$('minpwm').onchange=saveCfg;
$('lp').onchange=()=>get('/lidar?pct='+$('lp').value).catch(()=>{});

// ---------- carte automatique : mêmes calculs que Lidar Lab (lidar_core.js) ----------
const LC=window.LidarCore;let map=[],cache=null;
if(!LC)$('mapinfo').textContent='lidar_core.js non chargé : recharge la page.';
function settings(){return{minRange:Math.max(0,+$('rmin').value||0),maxRange:+$('rmax').value||12,minIntensity:Math.max(0,+$('imin').value||0)}}
const gres=()=>Math.max(0.02,Math.min(0.25,+$('gres').value||0.05));
function loadMap(){try{map=JSON.parse(localStorage.getItem('carte')||'[]').map(e=>Object.assign(LC.parseCsv(e.text,e.name),{rawCsv:e.text,pose:e.pose,mapRegistered:e.reg,isAnchor:e.anchor,visible:e.reg,note:e.note||''}))}catch(e){map=[]}}
function saveMap(){try{localStorage.setItem('carte',JSON.stringify(map.map(s=>({name:s.name,text:s.rawCsv,pose:s.pose,reg:s.mapRegistered,anchor:!!s.isAnchor,note:s.note}))))}catch(e){$('capst').textContent='Mémoire du navigateur pleine : exporte, puis « Nouvelle carte ».'}}
// recale le scan s sur les autres scans intégrés (le premier devient l'origine)
function locate(s){const f=settings(),res=gres(),ref=map.filter(o=>o!==s&&o.mapRegistered);
 if(!ref.length){s.pose=[0,0,0];s.mapRegistered=s.visible=s.isAnchor=true;s.note='origine de la carte';return true}
 s.isAnchor=false;const g=LC.cellsToGrid(LC.computeGridCells(ref,o=>LC.filterScanPoints(o,f),res),res),pts=LC.filterScanPoints(s,f);
 const fail=n=>{s.mapRegistered=s.visible=false;s.note=n;return false};
 if(!g||g.occupied<10)return fail('carte précédente trop pauvre');
 if(pts.length<20)return fail('pas assez de points après nettoyage');
 const r=LC.locateScanOnGrid(pts,g,{minOverlap:Math.min(1,Math.max(.05,(+$('ovl').value||35)/100))});
 if(!r.ok)return fail(r.ambiguous?'refusé : plusieurs positions possibles':'refusé : trop peu de murs communs ('+Math.round((r.overlap||0)*100)+' %)');
 s.pose=r.pose;s.mapRegistered=s.visible=true;s.note='recouvrement '+Math.round(r.overlap*100)+' % · écart '+(r.inlierRms*100).toFixed(1)+' cm';return true}
// grid map affichée/exportée : scans intégrés + filtre temporel, comme Lidar Lab
function rebuild(){const reg=map.filter(s=>s.mapRegistered),res=gres(),f=settings(),tf=$('tfilt').checked;
 const cells=LC.computeGridCells(reg,s=>LC.temporalFilter(s,map,{enabled:tf,tolerance:0.18,filter:f}),res);
 cache={cells,res,grid:LC.cellsToGrid(cells,res)};renderList();drawMap();
 $('mapinfo').textContent=map.length?reg.length+'/'+map.length+' scans intégrés'+(cache.grid?' · carte '+(cache.grid.width*res).toFixed(1)+' × '+(cache.grid.height*res).toFixed(1)+' m':''):'Capture un premier scan : il devient l’origine (0, 0, 0°) de la carte.'}
const mc=$('map'),mx=mc.getContext('2d');
function drawMap(){const[w,h,d]=sizeCanvas(mc);mx.fillStyle='#0c1118';mx.fillRect(0,0,w,h);if(!cache||!cache.grid)return;
 const g=cache.grid,res=cache.res,W=g.width*res,H=g.height*res,s=Math.min((w-20*d)/W,(h-20*d)/H),ox=(w-W*s)/2,oy=(h-H*s)/2;
 const X=x=>ox+(x-g.origin[0])*s,Y=y=>h-oy-(y-g.origin[1])*s,c=Math.max(1,res*s);
 for(let r=0;r<g.height;r++)for(let k=0;k<g.width;k++){const v=g.rows[r][k];if(v<0)continue;mx.fillStyle=v===1?'#f4f7fb':'#28445a';mx.fillRect(ox+k*res*s,oy+r*res*s,c,c)}
 const reg=map.filter(q=>q.mapRegistered),last=reg[reg.length-1];
 if(last&&scan){mx.fillStyle='rgba(255,184,107,.75)';const t=last.pose[2]*Math.PI/180,co=Math.cos(t),si=Math.sin(t);
  for(const[a,r]of scan.pts){if(r<0.05)continue;const u=a*Math.PI/180,px=r*Math.cos(u),py=r*Math.sin(u);mx.fillRect(X(last.pose[0]+co*px-si*py)-d,Y(last.pose[1]+si*px+co*py)-d,2*d,2*d)}}
 reg.forEach((q,i)=>{const x=X(q.pose[0]),y=Y(q.pose[1]),t=q.pose[2]*Math.PI/180;mx.strokeStyle=mx.fillStyle=q===last?'#ffb86b':'#69d4c5';mx.lineWidth=2*d;
  mx.beginPath();mx.arc(x,y,4*d,0,7);mx.fill();mx.beginPath();mx.moveTo(x,y);mx.lineTo(x+Math.cos(t)*12*d,y-Math.sin(t)*12*d);mx.stroke();
  mx.font=(11*d)+'px system-ui';mx.fillText(String(map.indexOf(q)+1),x+6*d,y-6*d)})}
function dl(text,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000)}
function renderList(){const l=$('list');l.innerHTML='';map.forEach((s,i)=>{const row=document.createElement('div');row.className='scanrow';
 const t=document.createElement('span');t.innerHTML='<b>'+(i+1)+'</b> · <span class="'+(s.mapRegistered?'ok':'ko')+'">'+(s.mapRegistered?'intégré':'non intégré')+'</span> · '+s.note;row.append(t);
 if(!s.mapRegistered){const b=document.createElement('button');b.textContent='Réessayer';b.onclick=()=>{locate(s);saveMap();rebuild()};row.append(b)}
 const a=document.createElement('button');a.textContent='CSV';a.onclick=()=>dl(s.rawCsv,s.name,'text/csv');row.append(a);l.append(row)})}
$('cap').onclick=async()=>{if(busy)return;setBusy(true);
 try{await stopNow();$('capst').textContent='Robot arrêté, attente de deux tours complets…';await freshScan(2);
  const s=parseScan(await get('/scan',3000));if(s.pts.length<50)throw new Error('scan vide');
  const n=map.length+1,d=new Date(),hh=[d.getHours(),d.getMinutes(),d.getSeconds()].map(v=>String(v).padStart(2,'0')).join('-');
  const sc=LC.parseCsv(s.text,'robot_scan_'+String(n).padStart(2,'0')+'_'+hh+'.csv');sc.rawCsv=s.text;map.push(sc);
  $('capst').textContent='Scan '+n+' : recalage sur la carte…';await sleep(40);
  const ok=locate(sc);saveMap();rebuild();
  $('capst').textContent=ok?'Scan '+n+' intégré ('+sc.note+'). Déplace-toi d’un petit pas puis capture le suivant.':'Scan '+n+' '+sc.note+'. Reviens vers une zone déjà cartographiée, ou rapproche-toi du scan précédent, puis recapture.'}
 catch(e){$('capst').textContent='Capture impossible : '+e.message+'. Vérifie la connexion Wi-Fi.'}finally{setBusy(false)}};
$('undo').onclick=()=>{if(!map.length)return;map.pop();saveMap();rebuild();$('capst').textContent='Dernier scan retiré.'};
$('relocate').onclick=async()=>{if(busy||!map.length)return;setBusy(true);map.forEach(s=>{s.mapRegistered=s.visible=s.isAnchor=false});
 for(let i=0;i<map.length;i++){$('capst').textContent='Recalage du scan '+(i+1)+'/'+map.length+'…';await sleep(20);locate(map[i])}
 saveMap();rebuild();$('capst').textContent='Poses recalculées.';setBusy(false)};
$('expgrid').onclick=()=>{if(cache&&cache.grid)dl(LC.gridToCsv(cache.grid),'grid_map.csv','text/csv')};
$('expmt').onclick=()=>{if(cache&&cache.grid)dl(LC.gridToMapToolCsv(cache.grid),'grid_map_map_tool.csv','text/csv')};
$('expposes').onclick=()=>{const p={};map.filter(s=>s.mapRegistered).forEach(s=>p[s.name.replace(/\.csv$/i,'')]=[+s.pose[0].toFixed(4),+s.pose[1].toFixed(4),+s.pose[2].toFixed(3)]);dl(JSON.stringify(p,null,2),'poses.json','application/json')};
$('all').onclick=async()=>{for(const s of map){dl(s.rawCsv,s.name,'text/csv');await sleep(700)}};
$('clear').onclick=()=>{if(confirm('Commencer une nouvelle carte ? Les '+map.length+' scans gardés dans le téléphone seront effacés (exporte-les avant).')){map=[];saveMap();rebuild()}};
for(const id of['gres','rmin','rmax','imin','tfilt'])$(id).addEventListener('change',rebuild);
const setBusy0=setBusy;setBusy=b=>{setBusy0(b);for(const id of['undo','relocate'])$(id).disabled=b};
if(LC){loadMap();rebuild()}drawJoy();drawLidar();loadCfg();
// ---------- liaison avec le PC : redirection automatique si le serveur Lidar Lab est présent ----------
let pcStay=false;$('pcstay').onclick=()=>{pcStay=true;$('pccount').textContent='Tu restes sur la page autonome du robot (scans gardés dans le téléphone).'};
(async function checkPc(){try{const r=JSON.parse(await get('/pc',1500));if(r.url){$('pclink').href=r.url;$('pcbox').hidden=false;
 if(!pcStay&&!checkPc.counting){checkPc.counting=true;for(let k=3;k>0&&!pcStay;k--){$('pccount').textContent='Ouverture automatique dans '+k+' s…';await sleep(1000)}if(!pcStay){await stopNow();location.href=r.url}}}
 else $('pcbox').hidden=true}catch(e){}setTimeout(checkPc,5000)})();
setInterval(()=>{if(!busy&&map.some(s=>s.mapRegistered))drawMap()},500);
</script></body></html>)HTML";

// ============================================================================
//  Serveur web
// ============================================================================
void handlePage() { server.send(200, "text/html; charset=utf-8", PAGE); }

// le serveur du PC se signale : on garde son adresse pour y renvoyer le téléphone
void handleRegister() {
  pcIp = server.client().remoteIP();
  pcPort = constrain(server.arg("port").toInt(), 1, 65535);
  pcSeenMs = millis();
  server.send(200, "text/plain", "ok");
}

void handlePc() {
  String url = pcPresent() ? "http://" + pcIp.toString() + ":" + String(pcPort) + "/telephone" : "";
  server.send(200, "application/json", "{\"url\":\"" + url + "\"}");
}

void handleCoreJs() {
  server.sendHeader("Cache-Control", "max-age=3600");
  server.send(200, "application/javascript; charset=utf-8", LIDAR_CORE_JS);
}

// consigne de vitesse en % (-100..100) ; la rampe l'atteint progressivement
void handleDrive() {
  turning = false;
  targetL = constrain(server.arg("l").toInt(), -100, 100) * 2.55f;
  targetR = constrain(server.arg("r").toInt(), -100, 100) * 2.55f;
  lastDriveMs = millis();
  server.send(200, "text/plain", "ok");
}

// joystick lâché : arrêt progressif (ne coupe pas une rotation chronométrée en cours)
void handleRelease() {
  if (!turning) targetL = targetR = 0;
  server.send(200, "text/plain", "ok");
}

void handleStop() {  // STOP : immédiat
  stopNow();
  server.send(200, "text/plain", "ok");
}

// rotation sur place : deg > 0 = à gauche (sens trigonométrique), deg < 0 = à droite
void handleTurn() {
  float deg = constrain(server.arg("deg").toFloat(), -180.0f, 180.0f);
  unsigned long ms = (unsigned long)(fabsf(deg) * msPerDeg + 0.5f);
  float dir = deg > 0 ? 1.0f : -1.0f;
  turning = true;
  targetL = -dir * TURN_SPEED;  // gauche recule, droite avance -> tourne à gauche
  targetR = dir * TURN_SPEED;
  turnEndMs = millis() + ms;
  server.send(200, "text/plain", String(ms));
}

void handleConfig() {
  bool changed = false;
  if (server.hasArg("mspd")) {
    msPerDeg = constrain(server.arg("mspd").toFloat(), 1.0f, 100.0f);
    prefs.putFloat("mspd", msPerDeg);
    changed = true;
  }
  if (server.hasArg("minpwm")) {
    minPwm = constrain(server.arg("minpwm").toInt(), 0, 140);
    prefs.putUChar("minpwm", minPwm);
    changed = true;
  }
  if (changed) applyWheels();
  server.send(200, "application/json", "{\"mspd\":" + String(msPerDeg, 1) + ",\"minpwm\":" + String(minPwm) + "}");
}

void handleLidar() {
  if (server.hasArg("pct")) setLidarSpeed(server.arg("pct").toInt());
  server.send(200, "text/plain", String(lidarPct));
}

// Dernier tour complet, au format CSV de Lidar Lab
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
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/csv", out);
}

// ============================================================================
void setup() {
  initWheels();  // en tout premier : roues arrêtées
  Serial.begin(115200);

  prefs.begin("robot", false);
  msPerDeg = prefs.getFloat("mspd", msPerDeg);
  minPwm = prefs.getUChar("minpwm", minPwm);

  Serial2.setRxBufferSize(4096);
  Serial2.begin(LIDAR_BAUD, SERIAL_8N1, RX_LIDAR, TX_LIDAR);
  Serial2.setTimeout(10);
  ld06.init();
  ledcAttach(LD06_PWM_PIN, LIDAR_PWM_HZ, 8);
  setLidarSpeed(lidarPct);
  ld06.enableCRC();
  ld06.enableFullScan();
  ld06.disableFiltering();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  WiFi.setSleep(false);

  server.on("/", handlePage);
  server.on("/lidar_core.js", handleCoreJs);
  server.on("/register", handleRegister);
  server.on("/pc", handlePc);
  server.on("/drive", handleDrive);
  server.on("/release", handleRelease);
  server.on("/stop", handleStop);
  server.on("/turn", handleTurn);
  server.on("/config", handleConfig);
  server.on("/scan", handleScan);
  server.on("/lidar", handleLidar);
  server.on("/favicon.ico", [] { server.send(204); });
  server.onNotFound([] { server.send(404, "text/plain", "introuvable"); });
  server.begin();

  lastRampUs = micros();
  Serial.print("Wi-Fi « ");
  Serial.print(AP_SSID);
  Serial.print(" » prêt. Ouvre http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();

  if (ld06.readScan()) {
    uint16_t n = min<uint16_t>(ld06.getNbPointsInScan(), LD06_MAX_PTS_SCAN);
    for (uint16_t i = 0; i < n; i++) {
      DataPoint *p = ld06.getPoints(i);
      snap[i] = {(uint16_t)(p->angle * 100.0f + 0.5f), p->distance, p->intensity};
    }
    snapCount = n;
    snapSpeed = ld06.getSpeed();
    snapId++;
  }

  updateMotion();  // rampes, fin des rotations, sécurité
}
