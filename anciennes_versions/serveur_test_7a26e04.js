"use strict";
// Serveur Lidar Lab ⇄ robot Wi-Fi : test de bout en bout avec un FAUX robot (SIMULATION, scans LD06 synthétiques).
// Lance le vrai serveur_robot/serveur.js, capture deux scans, vérifie fichiers, poses et relais des commandes.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const S = require("./synthetic_ld06");

const walls = [...S.rect(0, 0, 6, 4), ...S.rect(4.8, 3.3, 5.8, 3.9), S.seg(0, 1.5, 0.8, 1.5)];
function fakeRobot() {
  const st = { pose: [1.5, 2, 0], id: 0, log: [], registered: null };
  const timer = setInterval(() => st.id++, 60);
  const srv = http.createServer((q, s) => {
    const u = new URL(q.url, "http://x");
    st.log.push(u.pathname + u.search);
    if (u.pathname === "/scan") {
      const pts = S.simulateScan({ pose: st.pose, walls, seed: st.id });
      return s.end(`# robot_wifi id=${st.id} hz=10.0 pts=${pts.length} pwm=40\nangle_deg,distance_mm,intensity\n` + pts.map((p) => `${p.angle.toFixed(2)},${Math.round(p.distance * 1000)},${p.intensity}`).join("\n") + "\n");
    }
    if (u.pathname === "/register") st.registered = u.searchParams.get("port");
    if (u.pathname === "/info") return s.end(st.v4 ? "introuvable" : JSON.stringify({ name: "robot-lidar", version: 5, mode: "wifi", ip: "127.0.0.1" }));
    if (u.pathname === "/pc") return s.end(JSON.stringify({ url: "" }));
    s.end(u.pathname === "/turn" ? "495" : "ok");
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ st, port: srv.address().port, close: () => (clearInterval(timer), srv.close()) })));
}
const req = (port, p, method = "GET", body) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, method, headers: { "content-type": "application/json" } }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ code: res.statusCode, body: b }));
    });
    r.on("error", reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });

test("serveur robot : relais, capture enregistrée sur le disque, recalage, séance partagée", async (t) => {
  const robot = await fakeRobot(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "seances_")),
    port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "serveur_robot", "serveur.js"), "--robot", "http://127.0.0.1:" + robot.port, "--port", String(port), "--dossier", dir], { stdio: "pipe" });
  t.after(() => (srv.kill(), robot.close()));
  for (let i = 0; i < 50; i++) {
    try {
      if ((await req(port, "/api/status")).code === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  // pages servies
  assert.match((await req(port, "/")).body, /pilote_lidar_lab\.js/);
  assert.match((await req(port, "/telephone")).body, /relié au PC/);
  assert.equal((await req(port, "/..%2f..%2fwindows/win.ini")).code !== 200, true);
  // relais des commandes et inscription auprès du robot
  assert.equal((await req(port, "/api/robot/drive?l=30&r=30")).body, "ok");
  assert.ok(robot.st.log.includes("/drive?l=30&r=30"));
  assert.equal((await req(port, "/api/robot/reboot")).code, 404, "commande non autorisée");
  assert.equal(robot.st.registered, String(port));
  // deux captures
  const c1 = JSON.parse((await req(port, "/api/capture", "POST")).body);
  assert.ok(c1.ok && c1.scan.anchor);
  robot.st.pose = [2.0, 2.1, 10];
  const c2 = JSON.parse((await req(port, "/api/capture", "POST")).body);
  assert.ok(c2.ok, c2.scan.note);
  const [x, y, a] = c2.scan.pose;
  assert.ok(Math.hypot(x - 0.5, y - 0.1) < 0.05 && Math.abs(a - 10) < 2, JSON.stringify(c2.scan.pose));
  assert.ok(robot.st.log.some((l) => l.startsWith("/stop")), "le robot est arrêté avant la capture");
  // fichiers sur le disque
  const seance = path.join(dir, c2.session.name),
    files = fs.readdirSync(seance);
  for (const f of ["seance.json", "poses.json", "grid_map.csv", "grid_map_map_tool.csv", c1.scan.name, c2.scan.name]) assert.ok(files.includes(f), f);
  const poses = JSON.parse(fs.readFileSync(path.join(seance, "poses.json"), "utf8"));
  assert.deepEqual(Object.keys(poses).length, 2);
  // la séance est la même pour Lidar Lab et le téléphone ; annuler retire le dernier scan (le fichier reste)
  const sess = JSON.parse((await req(port, "/api/session")).body);
  assert.equal(sess.scans.length, 2);
  const u = JSON.parse((await req(port, "/api/undo", "POST")).body);
  assert.equal(u.scans.length, 1);
  assert.ok(fs.existsSync(path.join(seance, c2.scan.name)));
});

test("serveur robot : recherche automatique du robot sur le réseau (v5 par /info, v4 par /pc)", async (t) => {
  const { probe, discoverRobot } = require("../serveur_robot/serveur.js");
  const robot = await fakeRobot();
  t.after(() => robot.close());
  const url = "http://127.0.0.1:" + robot.port;
  assert.equal(await probe(url), url, "robot v5 reconnu");
  robot.st.v4 = true;
  assert.equal(await probe(url), url, "robot v4 reconnu par /pc");
  assert.equal(await probe("http://127.0.0.1:1", 300), null, "adresse sans robot ignorée");
  robot.st.v4 = false;
  assert.equal(await discoverRobot(["http://127.0.0.1:1", url]), url, "premier candidat qui répond");
});
