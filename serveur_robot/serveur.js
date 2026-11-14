"use strict";
// ============================================================================
//  Serveur Lidar Lab ⇄ robot Wi-Fi (PC)
//
//  - sert Lidar Lab (http://localhost:8000) et la version téléphone (/telephone)
//  - relaie le pilotage et le LiDAR vers le robot (ESP32_robot_wifi_v4 ou v5)
//  - trouve le robot tout seul : robot-lidar.local, 192.168.4.1, puis balayage du réseau local
//  - à chaque capture : enregistre le scan CSV sur le disque, le recale avec les calculs
//    de Lidar Lab (lidar_core.js) et met à jour poses.json et grid_map.csv
//  - Lidar Lab et le téléphone voient la même séance en direct
//
//  Lancer (PC et robot sur le même réseau local : PC en Ethernet accepté) :
//      node serveur_robot/serveur.js
//  Options : --robot auto (défaut) ou http://192.168.1.37   --port 8000   --dossier C:\chemin\des\seances
//  Aucune dépendance à installer. Aucune donnée n'est envoyée sur internet.
// ============================================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const LC = require("../lidar_core.js");
const { createExplorer } = require("./exploration.js");

const ROOT = path.join(__dirname, "..");
function option(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const PORT = +option("port", 8000);
const TP_DATA = path.join(os.homedir(), "TP-cartographie", "data");
const DOSSIER = path.resolve(option("dossier", fs.existsSync(TP_DATA) ? path.join(TP_DATA, "robot_wifi") : path.join(ROOT, "seances_robot")));
const ROBOT_ADDRESS_FILE = path.join(path.dirname(DOSSIER), "robot_address.json");
function validRobotUrl(value) {
  try {
    const u = new URL(String(value));
    const h = u.hostname.toLowerCase();
    const privateHost = h === "localhost" || h.endsWith(".local") || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^127\./.test(h);
    return (u.protocol === "http:" || u.protocol === "https:") && privateHost && !u.username && !u.password ? u.origin : "";
  } catch { return ""; }
}
function readSavedRobotAddress() {
  try { return validRobotUrl(JSON.parse(fs.readFileSync(ROBOT_ADDRESS_FILE, "utf8")).url); } catch { return ""; }
}
function saveRobotAddress(value) {
  if (ROBOT_OPT !== "auto") return;
  const url = validRobotUrl(value);
  if (!url) return;
  try {
    fs.mkdirSync(path.dirname(ROBOT_ADDRESS_FILE), { recursive: true });
    fs.writeFileSync(ROBOT_ADDRESS_FILE, JSON.stringify({ url, savedAt: new Date().toISOString() }, null, 2));
  } catch {}
}
const ROBOT_OPT = option("robot", "auto").replace(/\/+$/, "");
let ROBOT = ROBOT_OPT === "auto" ? readSavedRobotAddress() : ROBOT_OPT; // adresse connue ou découverte

// ---------------- état ----------------
let robotOnline = false,
  robotLastSeen = 0,
  lastScan = { text: "", id: -1, at: 0 };
const DEFAULT_SETTINGS = { gres: 0.05, rmin: 0.05, rmax: 12, imin: 0, ovl: 35, tfilt: true };
let seance = null; // { name, dir, settings, scans:[{name,pose,reg,anchor,note}] }
const parsed = new Map(); // nom -> scan LidarCore (points)
let version = 0,
  busy = false;

// ---------------- robot ----------------
function robotGet(p, timeout = 1500) {
  return new Promise((resolve, reject) => {
    if (!ROBOT) return reject(new Error("robot pas encore trouvé sur le réseau"));
    const req = http.get(ROBOT + p, { timeout }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        robotOnline = true;
        robotLastSeen = Date.now();
        saveRobotAddress(ROBOT);
        if (res.statusCode !== 200) reject(new Error("robot HTTP " + res.statusCode));
        else resolve(body);
      });
    });
    req.on("timeout", () => req.destroy(new Error("robot injoignable (délai dépassé)")));
    req.on("error", (e) => {
      if (Date.now() - robotLastSeen > 4000) robotOnline = false;
      reject(e);
    });
  });
}
const scanId = (text) => {
  const m = /id=(\d+)/.exec(text.split("\n")[0] || "");
  return m ? +m[1] : -1;
};
const scanMoving = (text) => {
  const m = /(?:^|\s)moving=([01])(?:\s|$)/.exec(text.split("\n")[0] || "");
  return m ? m[1] === "1" : null;
};
// dernier scan du robot, partagé entre PC et téléphone (au plus un appel au robot toutes les 120 ms)
let scanPending = null;
async function robotScan(maxAge = 120) {
  if (Date.now() - lastScan.at < maxAge && lastScan.text) return lastScan;
  if (!scanPending)
    scanPending = robotGet("/scan", 6000) // un scan de ~6 ko peut mettre 1 à 3 s via un partage de connexion
      .then((text) => (lastScan = { text, id: scanId(text), moving: scanMoving(text), at: Date.now() }))
      .finally(() => (scanPending = null));
  return scanPending;
}
// ---------------- recherche du robot sur le réseau ----------------
// reconnaît le robot : /info (v5) ou /pc (v4)
function probe(url, timeout = 700) {
  const ask = (p) =>
    new Promise((res) => {
      const r = http.get(url + p, { timeout }, (x) => {
        let b = "";
        x.setEncoding("utf8");
        x.on("data", (c) => (b += c));
        x.on("end", () => {
          try {
            res(JSON.parse(b));
          } catch {
            res(null);
          }
        });
      });
      r.on("timeout", () => r.destroy());
      r.on("error", () => res(null));
    });
  return ask("/info").then((j) => (j && j.name === "robot-lidar" ? url : ask("/pc").then((k) => (k && "url" in k ? url : null))));
}
async function discoverRobot(first = [ROBOT, "http://robot-lidar.local", "http://192.168.4.1"].filter(Boolean)) {
  for (const u of [...new Set(first)]) if (await probe(u, 1500)) return u;
  // balayage des réseaux locaux du PC (x.y.z.1 à x.y.z.254), 64 adresses à la fois
  const bases = new Set(
    Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."))
      .map((i) => i.address.split(".").slice(0, 3).join("."))
  );
  for (const b of bases) {
    const urls = [];
    for (let k = 1; k < 255; k++) urls.push("http://" + b + "." + k);
    for (let i = 0; i < urls.length; i += 64) {
      const hit = (await Promise.all(urls.slice(i, i + 64).map((u) => probe(u)))).find(Boolean);
      if (hit) return hit;
    }
  }
  return null;
}
let searching = false;
async function keepRobotFound() {
  if (ROBOT_OPT !== "auto" || searching) return;
  if (ROBOT && Date.now() - robotLastSeen < 15000) return;
  searching = true;
  try {
    const found = await discoverRobot();
    if (found && found !== ROBOT) console.log("Robot trouvé : " + found);
    if (found) {
      ROBOT = found;
      robotLastSeen = Date.now();
      saveRobotAddress(found);
    } else if (!ROBOT) console.log("Robot introuvable pour l’instant (même réseau local que le PC ? robot allumé ? Wi-Fi invité/isolation client désactivée ?) — nouvel essai dans 5 s.");
  } finally {
    searching = false;
  }
}
// le robot apprend l'adresse du PC pour rediriger le téléphone
function register() {
  robotGet("/register?port=" + PORT, 1200).catch(() => {});
}
if (require.main === module) {
  setInterval(() => keepRobotFound().then(register), 5000);
  setInterval(register, 3000);
  keepRobotFound().then(register);
}

// ---------------- séance (fichiers) ----------------
const stamp = () => {
  const d = new Date(),
    p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}`;
};
function newSeance() {
  const name = "seance_" + stamp(),
    dir = path.join(DOSSIER, name);
  fs.mkdirSync(dir, { recursive: true });
  seance = { name, dir, settings: { ...DEFAULT_SETTINGS }, scans: [] };
  parsed.clear();
  saveSeance();
}
function loadLatestSeance() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const dirs = fs
    .readdirSync(DOSSIER)
    .filter((d) => d.startsWith("seance_") && fs.existsSync(path.join(DOSSIER, d, "seance.json")))
    .sort();
  if (!dirs.length) return newSeance();
  const dir = path.join(DOSSIER, dirs[dirs.length - 1]),
    data = JSON.parse(fs.readFileSync(path.join(dir, "seance.json"), "utf8"));
  seance = { name: dirs[dirs.length - 1], dir, settings: { ...DEFAULT_SETTINGS, ...data.settings }, scans: data.scans.filter((s) => fs.existsSync(path.join(dir, s.name))) };
  parsed.clear();
}
function scanObj(entry) {
  if (!parsed.has(entry.name)) {
    const text = fs.readFileSync(path.join(seance.dir, entry.name), "utf8");
    parsed.set(entry.name, LC.parseCsv(text, entry.name));
  }
  const s = parsed.get(entry.name);
  s.pose = entry.pose;
  s.mapRegistered = s.visible = !!entry.reg;
  s.isAnchor = !!entry.anchor;
  return s;
}
const filt = () => ({ minRange: Math.max(0, +seance.settings.rmin || 0), maxRange: +seance.settings.rmax || 12, minIntensity: Math.max(0, +seance.settings.imin || 0) });
const gres = () => Math.max(0.02, Math.min(0.25, +seance.settings.gres || 0.05));
function currentGrid() {
  const all = seance.scans.map(scanObj),
    reg = all.filter((s) => s.mapRegistered),
    f = filt();
  if (!reg.length) return null;
  const cells = LC.computeGridCells(reg, (s) => LC.temporalFilter(s, all, { enabled: !!seance.settings.tfilt, tolerance: 0.18, filter: f }), gres());
  return LC.cellsToGrid(cells, gres());
}
function saveSeance() {
  fs.writeFileSync(path.join(seance.dir, "seance.json"), JSON.stringify({ app: "Lidar Lab robot Wi-Fi", name: seance.name, settings: seance.settings, scans: seance.scans }, null, 2));
  const poses = {};
  for (const s of seance.scans) if (s.reg) poses[s.name.replace(/\.csv$/i, "")] = [+s.pose[0].toFixed(4), +s.pose[1].toFixed(4), +s.pose[2].toFixed(3)];
  fs.writeFileSync(path.join(seance.dir, "poses.json"), JSON.stringify(poses, null, 2));
  const g = currentGrid();
  if (g) {
    fs.writeFileSync(path.join(seance.dir, "grid_map.csv"), LC.gridToCsv(g));
    fs.writeFileSync(path.join(seance.dir, "grid_map_map_tool.csv"), LC.gridToMapToolCsv(g));
  }
  version++;
}
// recalage d'un scan sur les autres scans intégrés : mêmes étapes que Lidar Lab
function locate(entry) {
  const s = scanObj(entry),
    others = seance.scans.filter((e) => e !== entry && e.reg).map(scanObj),
    f = filt(),
    res = gres();
  if (!others.length) {
    Object.assign(entry, { pose: [0, 0, 0], reg: true, anchor: true, note: "origine de la carte" });
    return true;
  }
  entry.anchor = false;
  const fail = (note) => (Object.assign(entry, { reg: false, note }), false);
  const g = LC.cellsToGrid(LC.computeGridCells(others, (o) => LC.filterScanPoints(o, f), res), res),
    pts = LC.filterScanPoints(s, f);
  if (!g || g.occupied < 10) return fail("carte précédente trop pauvre");
  if (pts.length < 20) return fail("pas assez de points après nettoyage");
  const r = LC.locateScanOnGrid(pts, g, { minOverlap: Math.min(1, Math.max(0.05, (+seance.settings.ovl || 35) / 100)) });
  if (!r.ok) return fail(r.ambiguous ? "refusé : plusieurs positions possibles" : `refusé : trop peu de murs communs (${Math.round((r.overlap || 0) * 100)} %)`);
  Object.assign(entry, { pose: r.pose.map((v) => +v.toFixed(5)), reg: true, note: `recouvrement ${Math.round(r.overlap * 100)} % · écart ${(r.inlierRms * 100).toFixed(1)} cm` });
  return true;
}

// ---------------- actions ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function capture(options = {}) {
  const firstStill = await waitForStillScan(-1, 2);
  const s = await waitForStillScan(firstStill.id, 2);
  const pts = LC.parseCsv(s.text, "x").pts.length;
  if (pts < 50) throw new Error("scan vide (" + pts + " points)");
  const n = seance.scans.length + 1,
    name = `scan_${String(n).padStart(2, "0")}_${stamp().slice(11)}.csv`;
  fs.writeFileSync(path.join(seance.dir, name), s.text);
  const entry = { name, pose: [0, 0, 0], reg: false, anchor: false, note: "", points: pts, capturedAt: new Date().toISOString() };
  seance.scans.push(entry);
  const ok = locate(entry);
  if (ok) entry.retryable = false;
  else if (options.auto && options.keepRejected) entry.retryable = true;
  if (!ok && options.auto && !options.keepRejected) {
    const refused = { ...entry, discarded: true };
    seance.scans.pop();
    parsed.delete(entry.name);
    fs.unlinkSync(path.join(seance.dir, entry.name));
    saveSeance();
    return { ok: false, scan: refused, retried: 0 };
  }
  const retried = ok ? retryPendingScans() : 0;
  saveSeance();
  return { ok, scan: entry, retried };
}
function retryPendingScans() {
  let total = 0, progress = true;
  while (progress) {
    progress = false;
    for (const entry of seance.scans) {
      if (!entry.retryable || entry.reg) continue;
      if (locate(entry)) {
        entry.retryable = false;
        total++;
        progress = true;
      }
    }
  }
  return total;
}
async function waitForStillScan(afterId, count, timeoutMs = 15000) {
  const t0 = Date.now();
  let lastId = -1, still = 0, s;
  while (Date.now() - t0 <= timeoutMs) {
    s = await robotScan(0);
    if (s.moving === null) {
      const e = new Error("le robot ne signale pas moving=0/1; téléverse le sketch Wi-Fi mis à jour avant de capturer");
      e.statusCode = 409;
      throw e;
    }
    if (s.id !== lastId) {
      lastId = s.id;
      if (s.id > afterId && !s.moving) still++;
      else still = 0;
      if (still >= count) return s;
    }
    await sleep(80);
  }
  const e = new Error(s && s.moving ? "robot encore en mouvement; capture annulée sans arrêter les moteurs" : "pas assez de tours LiDAR stables pour capturer");
  e.statusCode = 409;
  throw e;
}
function relocateAll() {
  seance.scans.forEach((e) => Object.assign(e, { reg: false, anchor: false }));
  for (const e of seance.scans) if (locate(e)) e.retryable = false;
  saveSeance();
}

// ---------------- HTTP ----------------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".csv": "text/csv; charset=utf-8", ".png": "image/png", ".md": "text/plain; charset=utf-8" };
function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({});
      }
    });
  });
}
function sessionJson() {
  return { version, name: seance.name, dossier: seance.dir, settings: seance.settings, scans: seance.scans, robot: { url: ROBOT || "recherche…", online: robotOnline } };
}
const ROBOT_CMDS = new Set(["drive", "release", "stop", "turn", "config", "lidar"]);

// ---------------- exploration automatique (bonus) ----------------
// Le module exploration.js décide où aller ; ici on lui fournit les vraies commandes du robot et la séance.
const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
const explorer = createExplorer({
  now: () => Date.now(),
  sleep: sleep2,
  scan: async () => LC.parseCsv((await robotScan(0)).text, "exploration"),
  turn: async (deg) => ((lastMoveCmd = Date.now()), +(await robotGet("/turn?deg=" + Math.round(deg), 1500)) || 0),
  drive: async (l, r) => ((lastMoveCmd = Date.now()), robotGet(`/drive?l=${Math.round(l)}&r=${Math.round(r)}`, 1200)),
  stop: () => robotGet("/stop", 1200),
  capture: async () => {
    while (busy) await sleep2(100);
    busy = true;
    try {
      const r = await capture({ auto: true, keepRejected: true });
      return { ok: !!r.ok, pose: r.scan && r.scan.pose };
    } finally {
      busy = false;
    }
  },
  state: () => {
    const reg = seance.scans.filter((e) => e.reg);
    if (!reg.length) return { pose: null, grid: null, visited: [] };
    const last = [...seance.scans].reverse().find((e) => e.reg);
    return { pose: last.pose, grid: currentGrid(), visited: reg.map((e) => e.pose) };
  },
});
// Pendant la conduite, on lit le LiDAR moins souvent : le robot ne traite qu'une requête à la fois et un
// scan (~6 ko) retarde les ordres de déplacement envoyés juste après (latence ressentie au téléphone).
let lastMoveCmd = 0;
const scanMaxAge = () => (Date.now() - lastMoveCmd < 1500 ? 900 : 150);

async function handle(req, res) {
  const u = new URL(req.url, "http://localhost"),
    p = decodeURIComponent(u.pathname);
  try {
    // --- relais vers le robot ---
    if (p === "/api/robot/scan") return send(res, 200, (await robotScan(scanMaxAge())).text, "text/csv; charset=utf-8");
    // exploration : l'arrêt passe TOUJOURS (même pendant une capture) ; le pilotage manuel est refusé pendant l'exploration
    if (p === "/api/explore/status") return send(res, 200, explorer.status());
    if (p === "/api/explore/stop" || p === "/api/robot/stop") {
      if (explorer.status().running) await explorer.stop();
      if (p === "/api/explore/stop") return send(res, 200, explorer.status());
    }
    if (explorer.status().running && (p === "/api/robot/drive" || p === "/api/robot/turn" || p === "/api/capture"))
      return send(res, 409, { erreur: "exploration automatique en cours : appuie sur STOP pour reprendre la main" });
    if (p === "/api/explore/start" && req.method === "POST") {
      if (!robotOnline) return send(res, 409, { erreur: "robot non connecté" });
      if (!explorer.start()) return send(res, 409, { erreur: "exploration déjà en cours" });
      return send(res, 200, explorer.status());
    }
    if (p.startsWith("/api/robot/")) {
      const cmd = p.slice(11);
      if (!ROBOT_CMDS.has(cmd)) return send(res, 404, { erreur: "commande inconnue" });
      if (busy && (cmd === "drive" || cmd === "turn")) return send(res, 409, { erreur: "capture ou recalage en cours; commande de mouvement refusée" });
      if (cmd === "drive" || cmd === "turn") lastMoveCmd = Date.now();
      return send(res, 200, await robotGet("/" + cmd + u.search, 1200), "text/plain; charset=utf-8");
    }
    // --- séance ---
    if (p === "/api/status") return send(res, 200, { robot: ROBOT || "recherche…", online: robotOnline, seance: seance.name, dossier: seance.dir, version });
    if (p === "/api/session") return send(res, 200, sessionJson());
    if (p.startsWith("/api/scan/")) {
      const name = path.basename(p.slice(10));
      if (!seance.scans.some((s) => s.name === name)) return send(res, 404, { erreur: "scan inconnu" });
      return send(res, 200, fs.readFileSync(path.join(seance.dir, name), "utf8"), "text/csv; charset=utf-8");
    }
    if (p.startsWith("/api/export/")) {
      const f = path.basename(p.slice(12));
      if (!["poses.json", "grid_map.csv", "grid_map_map_tool.csv", "seance.json"].includes(f) || !fs.existsSync(path.join(seance.dir, f))) return send(res, 404, { erreur: "pas encore de carte" });
      res.writeHead(200, { "content-type": TYPES[path.extname(f)], "content-disposition": `attachment; filename="${f}"`, "cache-control": "no-store" });
      return res.end(fs.readFileSync(path.join(seance.dir, f)));
    }
    if (req.method === "POST" && p.startsWith("/api/")) {
      if (busy) return send(res, 409, { erreur: "calcul déjà en cours" });
      busy = true;
      try {
        const body = await readBody(req);
        if (p === "/api/capture") return send(res, 200, { ...(await capture(body)), session: sessionJson() });
        if (p === "/api/undo") {
          const e = seance.scans.pop();
          if (e) parsed.delete(e.name); // le fichier CSV reste sur le disque
          saveSeance();
          return send(res, 200, sessionJson());
        }
        if (p === "/api/retry") {
          const e = seance.scans.find((s) => s.name === body.name);
          let retried = 0;
          if (e && locate(e)) {
            e.retryable = false;
            retried = retryPendingScans();
          }
          saveSeance();
          return send(res, 200, { ...sessionJson(), retried });
        }
        if (p === "/api/relocate") return relocateAll(), send(res, 200, sessionJson());
        if (p === "/api/settings") {
          for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in body) seance.settings[k] = k === "tfilt" ? !!body[k] : +body[k];
          saveSeance();
          return send(res, 200, sessionJson());
        }
        if (p === "/api/new") return newSeance(), send(res, 200, sessionJson());
        return send(res, 404, { erreur: "action inconnue" });
      } finally {
        busy = false;
      }
    }
    // --- fichiers : Lidar Lab et version téléphone ---
    if (p === "/telephone" || p === "/telephone/") return send(res, 200, fs.readFileSync(path.join(__dirname, "telephone.html")), TYPES[".html"]);
    const file = path.join(ROOT, p === "/" ? "index.html" : p);
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, { erreur: "interdit" });
    if (/(^|[\\/])\.|node_modules|seances_robot/.test(path.relative(ROOT, file)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "introuvable", "text/plain");
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    return send(res, e.statusCode || 502, { erreur: e.message || String(e) });
  }
}

if (require.main === module) {
loadLatestSeance();
const srv = http.createServer(handle);
srv.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error("Le port " + PORT + " est déjà utilisé par un autre programme (souvent « python -m http.server " + PORT + " », qui sert Lidar Lab SANS le robot). Ferme ce programme, ou lance : node serveur_robot/serveur.js --port " + (PORT + 1));
  else console.error(e);
  process.exit(1);
});
srv.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."))
    .map((i) => i.address);
  console.log("Lidar Lab + robot Wi-Fi");
  console.log("  Lidar Lab sur ce PC   : http://localhost:" + PORT);
  for (const ip of ips) console.log("  Téléphone (Lidar Lab) : http://" + ip + ":" + PORT + "/   (version simplifiée : /telephone)");
  console.log("  Sur le PC, utilise bien CETTE adresse (port " + PORT + ") : un autre onglet Lidar Lab ne verrait pas les captures du téléphone.");
  console.log("  Robot                 : " + (ROBOT || "recherche automatique (robot-lidar.local, 192.168.4.1, réseau local)…") + " — le téléphone qui ouvre l’adresse du robot est renvoyé vers le PC");
  console.log("  Séance                : " + seance.dir);
  console.log("Ctrl+C pour arrêter.");
});
}

module.exports = { handle, probe, discoverRobot }; // pour les tests
