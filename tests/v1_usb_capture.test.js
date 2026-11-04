"use strict";
// Capture USB de la V1 avec un FAUX port série (SIMULATION) qui imite la carte LD06_capture.
// Vérifie le logiciel : connexion, réception des tours CSV découpés en paquets, recalage, export brut,
// délai d'attente, câble débranché, déconnexion. Ne vérifie PAS le câble, la carte ni le LD06 réels.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, fakeSerial, settle } = require("./harness");
const SC = require("./scenarios");

const APP = "index.html";
const frame = (pose, seed, circles = [SC.PILLAR]) => SC.S.toCsv(SC.S.simulateScan({ pose, walls: SC.ROOM, circles, seed }), "printScanCSV");

async function connected() {
  const fake = fakeSerial(),
    h = loadApp(APP, { serial: fake.serial });
  await h.click("connectUsb");
  await settle();
  return { h, fake };
}
/** Clique « Prendre le scan suivant », puis la carte envoie `text` (paquets de `chunk` octets). */
async function capture(h, fake, text, chunk) {
  const done = h.click("captureUsb");
  await settle();
  fake.send(text, chunk);
  await done;
}

test("USB 1. connexion : port ouvert à 921600 bauds, boutons activés", async () => {
  const { h, fake } = await connected();
  assert.deepEqual(JSON.parse(JSON.stringify(fake.port.openedWith)), { baudRate: 921600 });
  assert.equal(h.$("captureUsb").disabled, false);
  assert.equal(h.$("disconnectUsb").disabled, false);
  assert.equal(h.$("connectUsb").disabled, true);
  assert.match(h.$("captureStatus").textContent, /Connecté à 921600 bauds/);
});

test("USB 2. trois captures : premier scan ancré, suivants recalés, CSV brut exportable", async () => {
  const { h, fake } = await connected(),
    poses = SC.ROOM_POSES.slice(0, 3);
  for (let k = 0; k < poses.length; k++) await capture(h, fake, frame(poses[k], 300 + k), [17, 61, 512][k]);
  const scans = h.app.scans;
  assert.equal(scans.length, 3);
  assert.deepEqual([...scans[0].pose], [0, 0, 0]);
  for (let k = 0; k < 3; k++) {
    assert.equal(scans[k].pts.length, 450, "tour complet");
    assert.ok(scans[k].mapRegistered, h.$("captureStatus").textContent);
    assert.ok(scans[k].hasIntensity);
    const exp = SC.S.relativePose(poses[0], poses[k]);
    assert.ok(Math.hypot(scans[k].pose[0] - exp[0], scans[k].pose[1] - exp[1]) < 0.05 && SC.angleErr(scans[k].pose[2], exp[2]) < 2, JSON.stringify(scans[k].pose));
  }
  assert.match(h.$("captureStatus").textContent, /Scan enregistré .* 450 points .* pose intégrée à la carte/);
  // export brut = lignes reçues, sans les fins de ligne CR ni la ligne vide de fin
  h.app.select(1);
  h.click("saveRaw");
  const expected = frame(poses[1], 301).split("\r\n").filter((l) => l).join("\n");
  assert.equal(h.lastDownload(scans[1].name), expected);
});

test("USB 2b. en-tête printScanCSV envoyé une seule fois : les scans suivants restent correctement lus", async () => {
  const { h, fake } = await connected(), pose = [1.5, 2.0, 0], full = frame(pose, 351), headerless = full.replace(/^N,Angle,Distance,Intensity,x,y\r?\n/, "");
  await capture(h, fake, full);
  await capture(h, fake, headerless);
  assert.equal(h.app.scans.length, 2);
  assert.equal(h.app.scans[0].pts.length, 450);
  assert.equal(h.app.scans[1].pts.length, 450);
  assert.ok(h.app.scans[1].hasIntensity);
  assert.equal(h.app.scans[1].rawCsv, headerless.split("\r\n").filter(Boolean).join("\n"));
});
test("USB 2c. aperçu du dernier tour reçu : le clic capture immédiatement le scan affiché", async () => {
  const { h, fake } = await connected(), previewFrame = frame([1.5, 2.0, 0], 359);
  const fillsBefore = h.ctx.fills;
  fake.send(previewFrame);
  await settle();
  assert.ok(h.ctx.fills > fillsBefore, "le rendu canvas a été actualisé à la réception du tour");
  assert.match(h.$("captureStatus").textContent, /Aperçu LiDAR en direct/);
  await h.click("captureUsb");
  assert.equal(h.app.scans.length, 1);
  assert.equal(h.app.scans[0].pts.length, 450);
  assert.equal(h.app.scans[0].mapRegistered, true);
});
test("USB 3. le dernier tour reçu avant le clic reste affiché et peut être capturé", async () => {
  const { h, fake } = await connected();
  const displayed = frame([4.2, 2.0, 30], 401);
  fake.send(displayed);
  await settle();
  await h.click("captureUsb");
  assert.equal(h.app.scans.length, 1);
  assert.equal(h.app.scans[0].rawCsv, displayed.split("\r\n").filter((l) => l).join("\n"));
});

test("USB 4. connexion au milieu d'un tour : le morceau sans en-tête n'est pas pris pour un scan", async () => {
  const { h, fake } = await connected(),
    full = frame([1.5, 2.0, 0], 501),
    tail = full.split("\r\n").slice(200).join("\r\n"); // fin d'un tour déjà commencé, sans en-tête
  const done = h.click("captureUsb");
  await settle();
  fake.send(tail + full);
  await done;
  assert.equal(h.app.scans.length, 1);
  assert.equal(h.app.scans[0].pts.length, 450);
  assert.ok(h.app.scans[0].rawCsv.startsWith("N,Angle,Distance,Intensity,x,y"));
});

test("USB 5. aucune donnée : message de délai dépassé, bouton réactivé", async () => {
  const { h } = await connected();
  await h.click("captureUsb");
  assert.match(h.$("captureStatus").textContent, /Capture impossible: Aucun scan complet reçu/);
  assert.equal(h.$("captureUsb").disabled, false);
  assert.equal(h.app.scans.length, 0);
});

test("USB 6. câble débranché pendant l'attente : capture annulée, état déconnecté, raison affichée", async () => {
  const { h, fake } = await connected();
  const done = h.click("captureUsb");
  await settle();
  fake.unplug();
  await done;
  await settle();
  assert.equal(h.$("connectUsb").disabled, false);
  assert.equal(h.$("captureUsb").disabled, true);
  assert.equal(h.$("disconnectUsb").disabled, true);
  assert.match(h.$("captureStatus").textContent, /déconnecté/i);
  assert.match(h.$("captureStatus").textContent, /device has been lost/);
  assert.equal(h.app.scans.length, 0);
});

test("USB 7. bouton Déconnecter : lecture annulée, port fermé, scans conservés, reconnexion possible", async () => {
  const { h, fake } = await connected();
  await capture(h, fake, frame([1.5, 2.0, 0], 701));
  await h.click("disconnectUsb");
  assert.ok(fake.log.includes("cancel"));
  assert.ok(fake.port.closed);
  assert.match(h.$("captureStatus").textContent, /Déconnecté\. Les scans déjà capturés restent/);
  assert.equal(h.app.scans.length, 1);
  assert.equal(h.$("connectUsb").disabled, false);
  await h.click("connectUsb");
  await settle();
  assert.equal(h.$("captureUsb").disabled, false);
});

test("USB 8. page ouverte sans localhost/HTTPS : capture refusée avec explication", async () => {
  const h = loadApp(APP);
  await h.click("connectUsb");
  assert.match(h.$("captureStatus").textContent, /localhost\/HTTPS dans Chrome ou Edge/);
});
