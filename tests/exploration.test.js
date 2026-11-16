"use strict";
// Exploration automatique (bonus) testée sur un robot SIMULÉ (tests/simulateur_robot.js) : ce ne sont pas des
// mesures du vrai robot. Critères fixés avant le contrôle final : aucune collision, poses recalées à moins de
// 10 cm et 3° de la vérité, au moins 80 % de la salle cartographiée.
const test = require("node:test");
const assert = require("node:assert");
const S = require("./synthetic_ld06.js");
const { createSimRobot } = require("./simulateur_robot.js");
const E = require("../serveur_robot/exploration.js");

// salle jamais utilisée pendant la mise au point : deux pièces reliées par une porte, table et armoire
const TWO = [S.seg(0, 0, 9, 0), S.seg(9, 0, 9, 3), S.seg(9, 3, 5, 3), S.seg(5, 3, 5, 4), S.seg(5, 4, 0, 4), S.seg(0, 4, 0, 0), S.seg(5, 0, 5, 1.2), S.seg(5, 2.2, 5, 3), ...S.rect(2.4, 1.6, 3.4, 2.2, "table"), ...S.rect(7.6, 0.3, 8.6, 0.8, "armoire")];
const insideTwo = (x, y) => (x > 0 && x < 5 && y > 0 && y < 4) || (x >= 5 && x < 9 && y > 0 && y < 3);

function coverage(sim, inside, xmax, ymax) {
  const g = sim.io.state().grid,
    t0 = sim.map[0].truth;
  let tot = 0,
    known = 0;
  for (let x = 0.05; x < xmax; x += 0.1)
    for (let y = 0.05; y < ymax; y += 0.1) {
      if (!inside(x, y)) continue;
      tot++;
      const p = S.relativePose(t0, [x, y, 0]),
        c = Math.floor((p[0] - g.origin[0]) / g.resolution),
        row = g.height - 1 - Math.floor((p[1] - g.origin[1]) / g.resolution),
        v = c >= 0 && c < g.width && row >= 0 && row < g.height ? g.rows[row][c] : -1;
      if (v !== -1) known++;
    }
  return known / tot;
}

test("X1. couloir libre : distance au premier point dans la largeur du robot", () => {
  const pts = [{ x: 2, y: 0.1 }, { x: 1, y: 0.5 }, { x: -1, y: 0 }];
  assert.strictEqual(E.corridorClearance(pts, 0, 0.2), 2); // (1, 0.5) est hors du couloir
  assert.strictEqual(E.corridorClearance(pts, 180, 0.2), 1);
  assert.strictEqual(E.corridorClearance(pts, 90, 0.2), Infinity);
});

test("X2. salle jamais vue (deux pièces, 3 tirages) : sans collision, poses justes, salle couverte", async () => {
  for (const seed of [11, 12, 13]) {
    const sim = createSimRobot({ walls: TWO, start: [1.5, 2, 0], seed });
    const ex = E.createExplorer(sim.io);
    ex.start();
    await ex.wait();
    assert.strictEqual(sim.st.collided, false, "collision, graine " + seed);
    const t0 = sim.map[0].truth;
    for (const m of sim.map) {
      const t = S.relativePose(t0, m.truth);
      assert.ok(Math.hypot(m.pose[0] - t[0], m.pose[1] - t[1]) < 0.1, `pose à plus de 10 cm (graine ${seed})`);
      assert.ok(Math.abs(((m.pose[2] - t[2] + 540) % 360) - 180) < 3, `angle à plus de 3° (graine ${seed})`);
    }
    const cov = coverage(sim, insideTwo, 9, 4);
    assert.ok(cov >= 0.8, `couverture ${Math.round(cov * 100)} % (graine ${seed})`);
    assert.match(ex.status().status, /plus de zone inconnue/);
    // le robot va jusqu'à la porte (x = 5 m) : la 2e pièce est cartographiée depuis l'embrasure
    assert.ok(sim.map.some((m) => m.truth[0] >= 4.8), "le robot doit atteindre la porte de la 2e pièce");
  }
});

test("X3. arrêt demandé : la boucle s'arrête et le robot reçoit /stop", async () => {
  const sim = createSimRobot({ walls: TWO, start: [1.5, 2, 0], seed: 4 });
  let scans = 0,
    stops = 0,
    ex;
  const io = {
    ...sim.io,
    scan: async () => {
      if (++scans === 6) ex.stop(); // l'utilisateur appuie sur STOP en plein pas
      return sim.io.scan();
    },
    stop: async () => {
      stops++;
      return sim.io.stop();
    },
  };
  ex = E.createExplorer(io);
  ex.start();
  await ex.wait();
  const s = ex.status();
  assert.strictEqual(s.running, false);
  assert.match(s.status, /arrêt demandé/);
  assert.ok(stops >= 2, "un /stop au début et un à la fin");
  assert.strictEqual(sim.st.cmd.l, 0);
  assert.strictEqual(sim.st.cmd.r, 0);
});

// Limite assumée : aucun scan n'est lu PENDANT un pas (≤ 0,35 m, ~1,4 s), car le robot ne traite qu'une requête à
// la fois ; un obstacle qui surgit pendant ces 1,4 s n'est pas vu. Il l'est au contrôle suivant, robot à l'arrêt.
test("X4. obstacle posé devant le robot entre deux pas : vu au contrôle à l'arrêt, pas de collision", async () => {
  // un carton est posé devant le robot APRÈS son choix de direction (il n'est pas dans la carte)
  const sim = createSimRobot({ walls: TWO, start: [1.5, 1.0, 0], seed: 5 });
  const box = S.rect(1.95, 0.85, 2.15, 1.15, "carton");
  let scans = 0;
  const io = {
    ...sim.io,
    scan: async () => {
      scans++;
      if (scans === 3) sim.st.extraWalls = box;
      return sim.io.scan();
    },
  };
  // le simulateur ajoute les obstacles supplémentaires au tracé des rayons et aux collisions
  const ex = E.createExplorer(io, { maxSteps: 3 });
  ex.start();
  await ex.wait();
  assert.strictEqual(sim.st.collided, false);
});

test("X5. deux recalages refusés de suite : arrêt « position perdue », robot arrêté", async () => {
  const sim = createSimRobot({ walls: TWO, start: [1.5, 2, 0], seed: 6 });
  let n = 0;
  const io = { ...sim.io, capture: async () => (n++ === 0 ? sim.io.capture() : { ok: false }) };
  const ex = E.createExplorer(io);
  ex.start();
  await ex.wait();
  assert.match(ex.status().status, /position perdue/);
  assert.strictEqual(sim.st.cmd.l, 0);
});

test("X7. essai court : arrêt après le nombre de pas choisi, déplacement mesuré par le recalage", async () => {
  const sim = createSimRobot({ walls: TWO, start: [1.5, 2, 0], seed: 11 });
  const ex = E.createExplorer(sim.io);
  ex.start({ maxSteps: 3 });
  await ex.wait();
  const s = ex.status();
  assert.match(s.status, /terminé : 3 pas/);
  assert.strictEqual(s.step, 3);
  assert.strictEqual(sim.st.collided, false);
  assert.ok(s.moves.length >= 1, "au moins un pas mesuré");
  for (const m of s.moves) {
    // robot simulé : 0,0075 m/s par % à 35 % = 0,26 m/s (±10 %) pour 0,25 estimé -> mesure ≈ visé à ±25 %
    assert.ok(m.mesure > 0.75 * m.vise && m.mesure < 1.25 * m.vise, JSON.stringify(m));
  }
  // un nouveau lancement sans réglage reprend les valeurs par défaut
  const ex2 = E.createExplorer(sim.io, { maxSteps: 1 });
  ex2.start();
  await ex2.wait();
  assert.strictEqual(ex2.status().maxSteps, 1);
});

test("X9. points du robot lui-même ignorés (secteur 300–340°, < 20 cm) ; tout autre point proche bloque toujours", () => {
  const P = (deg, r) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180), r });
  const wall = [];
  for (let a = 0; a < 360; a += 2) wall.push(P(a, 3)); // salle ronde de 3 m
  const o = E.DEFAULTS;
  // le robot vu à 11 cm à l'avant droit : ignoré, la voie est libre jusqu'au mur
  const self = E.localPoints({ pts: [...wall, P(320, 0.11), P(330, 0.12)] }, o);
  assert.ok(E.corridorClearance(self, 0, o.halfWidth) > 2.9);
  assert.ok(E.corridorClearance(self, -40, o.halfWidth) > 2.9);
  // même distance mais HORS du secteur (devant à gauche) : obstacle, les directions de ce côté sont bloquées
  const obst = E.localPoints({ pts: [...wall, P(20, 0.12)] }, o);
  assert.ok(E.corridorClearance(obst, 0, o.halfWidth) < 0.15);
  assert.ok(E.corridorClearance(obst, 60, o.halfWidth) < 0.15);
  // dans le secteur mais à plus de 20 cm : obstacle
  const far = E.localPoints({ pts: [...wall, P(320, 0.3)] }, o);
  assert.ok(E.corridorClearance(far, -40, o.halfWidth) < 0.31);
  // masque désactivé : le point du robot bloque de nouveau
  const off = E.localPoints({ pts: [...wall, P(320, 0.11)] }, { ...o, selfMask: null });
  assert.ok(E.corridorClearance(off, 0, o.halfWidth) < 0.15);
});

test("X10. recoin : chemin bouché, sortie derrière -> demi-tour ; entouré de tous côtés -> arrêt « aucune direction libre »", () => {
  // grille 3 x 3 m libre, moitié gauche (x < 1 m) inconnue : la frontière est DERRIÈRE le robot (cap 0°, en x = 1,5 m)
  const res = 0.05, W = 60, H = 60, rows = [];
  // bord irrégulier (une cellule sur deux inconnue en x = 1,0 m) : une frontière doit toucher 2 cellules inconnues
  for (let r = 0; r < H; r++) rows.push(Array.from({ length: W }, (_, c) => ((c + 0.5) * res < 1.0 || (c === 20 && r % 2 === 0) ? -1 : 0)));
  const grid = { rows, width: W, height: H, resolution: res, origin: [0, 0] };
  const P = (deg, r) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180), r });
  const o = E.DEFAULTS;
  // obstacles à 30 cm partout sauf devant (±60°, ouverture plus large que le robot), libre devant jusqu'à 3 m
  const pts = [];
  for (let a = 0; a < 360; a += 2) pts.push(Math.abs(((a + 180) % 360) - 180) <= 60 ? P(a, 3) : P(a, 0.3));
  const ch = E.chooseDirection(pts, [1.5, 1.5, 0], grid, [[1.5, 1.5, 0]], o);
  assert.ok(ch && !ch.blocked, "une direction doit être proposée");
  assert.strictEqual(ch.mode, "demi-tour");
  assert.strictEqual(ch.turnDeg, 0); // la seule sortie
  assert.ok(ch.step >= 0.1 && ch.step <= 0.35);
  assert.ok(E.corridorClearance(pts, ch.turnDeg, o.halfWidth) >= o.safety + ch.step, "le contrôle d'avant-pas doit passer");
  // entouré à 30 cm de tous côtés : arrêt explicite, pas « plus de zone inconnue »
  const closed = [];
  for (let a = 0; a < 360; a += 2) closed.push(P(a, 0.3));
  const ch2 = E.chooseDirection(closed, [1.5, 1.5, 0], grid, [[1.5, 1.5, 0]], o);
  assert.ok(ch2 && ch2.blocked);
});

// ---------------------------------------------------------------- intégration avec le VRAI serveur
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

/** Faux robot HTTP (SIMULATION) en temps réel, branché sur le simulateur : mêmes routes que le sketch v7. */
function httpSimRobot(walls, start) {
  const sim = createSimRobot({ walls, start, seed: 21 });
  let last = Date.now(),
    id = 0,
    turnUntil = 0;
  const log = [];
  const tick = () => {
    const now = Date.now();
    sim.io.sleep(now - last); // fait avancer la simulation du temps réellement écoulé
    last = now;
  };
  const timer = setInterval(() => {
    tick();
    id++;
  }, 80);
  const srv = http.createServer(async (q, s) => {
    tick();
    const u = new URL(q.url, "http://x");
    log.push(u.pathname + u.search);
    if (u.pathname === "/scan") {
      const moving = Date.now() < turnUntil || Date.now() - sim.st.cmd.at <= 700;
      const pts = S.simulateScan({ pose: sim.st.pose, walls, seed: id });
      return s.end(`# robot_wifi id=${id} hz=12.0 pts=${pts.length} pwm=40 moving=${moving ? 1 : 0}\nangle_deg,distance_mm,intensity\n` + pts.map((p) => `${p.angle.toFixed(2)},${Math.round(p.distance * 1000)},${p.intensity}`).join("\n") + "\n");
    }
    if (u.pathname === "/drive") return await sim.io.drive(+u.searchParams.get("l"), +u.searchParams.get("r")), s.end("ok");
    if (u.pathname === "/stop") return await sim.io.stop(), s.end("ok");
    if (u.pathname === "/turn") {
      const ms = await sim.io.turn(+u.searchParams.get("deg"));
      turnUntil = Date.now() + ms;
      return s.end(String(ms));
    }
    if (u.pathname === "/info") return s.end(JSON.stringify({ name: "robot-lidar", version: 7, mode: "point_acces", ip: "127.0.0.1" }));
    if (u.pathname === "/pc") return s.end(JSON.stringify({ url: "" }));
    s.end("ok");
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ sim, log, port: srv.address().port, close: () => (clearInterval(timer), srv.close()) })));
}
const req = (port, p, method = "GET", body = "{}") =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, method, headers: { "content-type": "application/json" } }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ code: res.statusCode, body: b }));
    });
    r.on("error", reject);
    r.end(method === "POST" ? body : undefined);
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("X6. vrai serveur + faux robot : l'exploration avance, refuse le pilotage manuel, STOP arrête tout", async (t) => {
  const robot = await httpSimRobot(TWO, [1.5, 2, 0]),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "explo_")),
    port = 19000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "serveur_robot", "serveur.js"), "--robot", "http://127.0.0.1:" + robot.port, "--port", String(port), "--dossier", dir], { stdio: "pipe" });
  t.after(() => (srv.kill(), robot.close()));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await req(port, "/api/status")).code === 200) break;
    } catch {}
    await wait(100);
  }
  await req(port, "/api/robot/scan"); // le serveur voit le robot en ligne
  const start = await req(port, "/api/explore/start", "POST");
  assert.equal(start.code, 200, start.body);
  // attendre au moins 3 pas recalés
  let st;
  for (let i = 0; i < 300; i++) {
    st = JSON.parse((await req(port, "/api/explore/status")).body);
    if (st.step >= 3 || !st.running) break;
    await wait(200);
  }
  assert.ok(st.step >= 3, "au moins 3 pas : " + JSON.stringify(st));
  // pendant l'exploration, le pilotage manuel est refusé
  assert.equal((await req(port, "/api/robot/drive?l=50&r=50")).code, 409);
  // STOP (bouton du panneau) : arrêt de l'exploration ET du robot
  await req(port, "/api/robot/stop");
  for (let i = 0; i < 50 && JSON.parse((await req(port, "/api/explore/status")).body).running; i++) await wait(100);
  st = JSON.parse((await req(port, "/api/explore/status")).body);
  assert.equal(st.running, false);
  assert.match(st.status, /arrêt demandé/);
  assert.ok(robot.log.filter((l) => l.startsWith("/stop")).length >= 2);
  assert.equal(robot.sim.st.collided, false);
  const sess = JSON.parse((await req(port, "/api/session")).body);
  assert.ok(sess.scans.filter((s) => s.reg).length >= 4, "origine + 3 pas recalés");
  // après l'arrêt, le pilotage manuel est de nouveau accepté
  assert.equal((await req(port, "/api/robot/drive?l=10&r=10")).code, 200);
});

test("X8. vrai serveur + faux robot : réglages d'essai bornés (pas maximum, vitesse estimée)", async (t) => {
  const robot = await httpSimRobot(TWO, [1.5, 2, 0]),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "explo_")),
    port = 19000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "serveur_robot", "serveur.js"), "--robot", "http://127.0.0.1:" + robot.port, "--port", String(port), "--dossier", dir], { stdio: "pipe" });
  t.after(() => (srv.kill(), robot.close()));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await req(port, "/api/status")).code === 200) break;
    } catch {}
    await wait(100);
  }
  await req(port, "/api/robot/scan");
  const start = await req(port, "/api/explore/start", "POST", JSON.stringify({ maxSteps: 2, speedEst: 5 }));
  assert.equal(start.code, 200, start.body);
  let st = JSON.parse(start.body);
  assert.equal(st.maxSteps, 2);
  assert.equal(st.speedEst, 0.6); // borné à 0,6 m/s
  await req(port, "/api/robot/stop"); // on ne roule pas à 0,6 m/s estimés : arrêt immédiat
  for (let i = 0; i < 50 && JSON.parse((await req(port, "/api/explore/status")).body).running; i++) await wait(100);
  const st2 = JSON.parse((await req(port, "/api/explore/start", "POST", JSON.stringify({ maxSteps: 2, speedEst: "abc" }))).body);
  assert.equal(st2.speedEst, 0.25); // valeur invalide : valeur par défaut
  for (let i = 0; i < 400 && JSON.parse((await req(port, "/api/explore/status")).body).running; i++) await wait(200);
  st = JSON.parse((await req(port, "/api/explore/status")).body);
  assert.match(st.status, /terminé : 2 pas|position perdue|plus de zone/);
  assert.equal(robot.sim.st.collided, false);
});
