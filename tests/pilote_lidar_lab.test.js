"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRobotPanel } = require("./harness");

test("panneau PC : Auto-SLAM actif par défaut et capture après un arrêt observé dans le flux LiDAR", async (t) => {
  const h = loadRobotPanel();
  t.after(() => h.close());
  await h.wait(80);
  assert.equal(h.el("rwAuto").checked, true, "le mode automatique est prêt dès l’ouverture");
  h.setMoving(true);
  await h.wait(350);
  assert.equal(h.calls.filter((c) => c.method === "POST" && c.url === "/api/capture").length, 0, "pas de capture tant que le robot bouge");
  h.setMoving(false);
  await h.wait(800);
  const captures = h.calls.filter((c) => c.method === "POST" && c.url === "/api/capture");
  assert.equal(captures.length, 1, "un arrêt détecté dans le flux déclenche la capture sans événement clavier");
  assert.equal(h.scans.length, 1);
  assert.equal(h.scans[0].mapRegistered, true);
});

test("panneau PC : décocher Auto-SLAM empêche les captures automatiques", async (t) => {
  const h = loadRobotPanel();
  t.after(() => h.close());
  await h.wait(80);
  h.el("rwAuto").checked = false;
  h.setMoving(true);
  await h.wait(350);
  h.setMoving(false);
  await h.wait(800);
  assert.equal(h.calls.filter((c) => c.method === "POST" && c.url === "/api/capture").length, 0);
});

test("panneau PC : Auto-SLAM capture après le relâchement d’une touche", async (t) => {
  const h = loadRobotPanel();
  t.after(() => h.close());
  await h.wait(30);
  h.el("rwAuto").checked = true;
  h.key("keydown", { key: "ArrowUp" });
  await h.wait(160);
  h.key("keyup", { key: "ArrowUp" });
  await h.wait(700);
  assert.ok(h.calls.some((c) => c.url.startsWith("/api/robot/drive?")), "la touche a piloté le robot");
  const captures = h.calls.filter((c) => c.method === "POST" && c.url === "/api/capture");
  assert.equal(captures.length, 1);
  assert.deepEqual(JSON.parse(captures[0].body), { auto: true, keepRejected: true });
  assert.equal(h.scans.length, 1);
  assert.deepEqual(Array.from(h.scans[0].pose), [1.25, -0.5, 17]);
  assert.equal(h.scans[0].mapRegistered, true);
  assert.ok(h.renderCount > 0, "les sélecteurs de scans ont été reconstruits");
  assert.equal(h.selected, 0, "le scan intégré est sélectionné dans la liste du PC");
});

test("panneau PC : après une rotation, Auto-SLAM attend la durée demandée avant la capture", async (t) => {
  const duration = 320, h = loadRobotPanel({ turnDuration: duration });
  t.after(() => h.close());
  await h.wait(30);
  h.el("rwAuto").checked = true;
  await h.turn(45);
  await h.wait(duration + 250);
  assert.equal(h.calls.filter((c) => c.method === "POST" && c.url === "/api/capture").length, 0, "pas de capture pendant la rotation");
  await h.wait(400);
  const capture = h.calls.find((c) => c.method === "POST" && c.url === "/api/capture");
  const turn = h.calls.find((c) => c.url.startsWith("/api/robot/turn?"));
  assert.ok(capture, "capture automatique effectuée après la rotation");
  assert.ok(capture.at - turn.at >= duration + 400, `délai capture=${capture.at - turn.at} ms`);
});

test("panneau PC : la conduite reste bloquée pendant toute la capture", async (t) => {
  let captureStart = 0;
  const h = loadRobotPanel({ capture: async (_request, calls) => {
    captureStart = calls.at(-1).at;
    await new Promise((resolve) => setTimeout(resolve, 220));
  } });
  t.after(() => h.close());
  await h.wait(30);
  h.el("rwAuto").checked = true;
  h.key("keydown", { key: "ArrowUp" });
  h.key("keyup", { key: "ArrowUp" });
  await h.wait(560);
  assert.ok(captureStart, "la capture a démarré");
  h.key("keydown", { key: "ArrowUp" });
  await h.wait(180);
  h.key("keyup", { key: "ArrowUp" });
  assert.equal(h.calls.some((c) => c.url.startsWith("/api/robot/drive?") && c.at >= captureStart), false, "aucune commande drive pendant la capture");
});

