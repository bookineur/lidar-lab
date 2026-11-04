// ============================================================================
//  ESP32 + LD06 : pilotage du robot par Wi-Fi depuis un téléphone — version 2
//
//  Réseau : Robot-LiDAR      mot de passe : lidar2026      page : http://192.168.4.1
//
//  Nouveautés par rapport à la v1 :
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
</style></head><body>
<header><h1>Robot LiDAR</h1><span id="st" class="ko">connexion…</span></header>
<main>
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
<h2>Scans</h2>
<div class="row" style="margin:0"><button class="cap" id="cap">Capturer le scan (robot arrêté)</button></div>
<div class="sub" id="capst" style="margin-top:8px">Arrête-toi, capture, avance d’un petit pas ou tourne de 15–45°, recommence. Garde des murs communs entre deux scans.</div>
<div id="list"></div>
<div class="row"><button id="all">Tout télécharger</button><button id="clear">Effacer la liste</button></div>
</section>

<section class="card">
<h2>Réglages du robot (enregistrés dans l’ESP32)</h2>
<div class="row"><label>Puissance de démarrage</label><input type="range" id="minpwm" min="0" max="140" value="60"><span id="mpv" class="val">60</span></div>
<div class="row"><label>Rotation : ms par degré</label><input type="number" id="mspd" step="0.1" min="1" max="100" value="11" style="width:90px;font:inherit;color:inherit;background:#111822;border:1px solid #3a4759;border-radius:7px;padding:8px"><button id="savecfg">Enregistrer</button></div>
<div class="row"><label>Rotation LiDAR</label><input type="range" id="lp" min="20" max="60" value="40"><span id="lpv" class="val">40 %</span></div>
<div class="sub">Puissance de démarrage : monte-la si une roue ne bouge pas au début du joystick, baisse-la si le robot démarre d’un coup.</div>
</section>
</main>
<script>
const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let joy={x:0,y:0,active:false},scan=null,captures=[],stopsToSend=3,busyDrive=false,busy=false,pendingFix=null;
try{captures=JSON.parse(localStorage.getItem('captures')||'[]')}catch(e){}
function status(ok,t){$('st').textContent=t;$('st').className=ok?'ok':'ko'}
async function get(url,ms=1500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,cache:'no-store'});if(!r.ok)throw new Error('erreur '+r.status);return await r.text()}finally{clearTimeout(t)}}
function setBusy(b){busy=b;document.querySelectorAll('[data-deg],#cap').forEach(x=>x.disabled=b)}

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

// ---------- captures ----------
function save(){try{localStorage.setItem('captures',JSON.stringify(captures))}catch(e){$('capst').textContent='Mémoire du navigateur pleine : télécharge puis efface la liste.'}}
function link(c){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c.text],{type:'text/csv'}));a.download=c.name;a.textContent='⬇ '+c.name+' · '+c.n+' points';return a}
function renderList(){const l=$('list');l.innerHTML='';captures.forEach(c=>l.append(link(c)))}
$('cap').onclick=async()=>{if(busy)return;setBusy(true);
 try{await stopNow();$('capst').textContent='Robot arrêté, attente de deux tours complets…';await freshScan(2);
  const s=parseScan(await get('/scan',3000));if(s.pts.length<50)throw new Error('scan vide');
  const n=captures.length+1,d=new Date(),hh=[d.getHours(),d.getMinutes(),d.getSeconds()].map(v=>String(v).padStart(2,'0')).join('-');
  captures.push({name:'robot_scan_'+String(n).padStart(2,'0')+'_'+hh+'.csv',text:s.text,n:s.pts.length});save();renderList();
  $('capst').textContent='Scan '+n+' gardé ('+s.pts.length+' points). Déplace-toi d’un petit pas puis capture le suivant.'}
 catch(e){$('capst').textContent='Capture impossible : '+e.message+'. Vérifie la connexion Wi-Fi.'}finally{setBusy(false)}};
$('all').onclick=async()=>{for(const c of captures){link(c).click();await sleep(700)}};
$('clear').onclick=()=>{if(confirm('Effacer les '+captures.length+' scans gardés dans le téléphone ?')){captures=[];save();renderList()}};
renderList();drawJoy();drawLidar();loadCfg();
</script></body></html>)HTML";

// ============================================================================
//  Serveur web
// ============================================================================
void handlePage() { server.send(200, "text/html; charset=utf-8", PAGE); }

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
