/* Lidar Lab — panneau « Robot Wi-Fi relié au PC ».
   Actif seulement quand Lidar Lab est ouvert via serveur_robot/serveur.js (http://localhost:8000).
   - pilotage du robot : boutons maintenus ou flèches / ZQSD du clavier, STOP, rotations 15° / 45°
   - aperçu LiDAR en direct dans la vue principale
   - « Capturer » : le PC enregistre le scan sur le disque et le recale (mêmes calculs que Lidar Lab)
   - synchronisation : les scans de la séance (pris depuis le PC OU le téléphone) apparaissent
     automatiquement dans la liste de Lidar Lab avec leur pose ; toutes les fonctions de Lidar Lab
     (grid map, exports, ICP, évaluation…) s'appliquent ensuite normalement. */
(function () {
  "use strict";
  function init() {
    if (typeof fetch !== "function" || typeof document === "undefined" || !document.querySelector) return;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(build)
      .catch(() => {}); // Lidar Lab ouvert sans le serveur : rien ne change
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function get(url, ms = 1500) {
    const c = new AbortController(),
      t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { signal: c.signal, cache: "no-store" });
      if (!r.ok) throw new Error((await r.text()) || "erreur " + r.status);
      return await r.text();
    } finally {
      clearTimeout(t);
    }
  }
  async function post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}), cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur || "erreur " + r.status);
    return j;
  }

  function build(status) {
    const card = document.createElement("section");
    card.className = "card";
    card.id = "robotWifiPc";
    card.innerHTML = `<h2>Robot Wi-Fi · relié au PC</h2>
<div class="sub" id="rwStatus">Connexion…</div>
<div class="sub" id="rwFolder" style="margin-top:4px"></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px;max-width:260px">
 <span></span><button type="button" data-move="up">▲ avant</button><span></span>
 <button type="button" data-move="left">◀ gauche</button><button type="button" id="rwStop" style="background:#8b2430;border-color:#c43b4a;font-weight:700">STOP</button><button type="button" data-move="right">droite ▶</button>
 <span></span><button type="button" data-move="down">▼ arrière</button><span></span>
</div>
<label class="sub" style="display:block;margin-top:8px"><input type="checkbox" id="rwKeys" checked> Piloter avec les flèches ou Z Q S D (maintenir la touche ; Espace = STOP)</label>
<div class="row"><label>Vitesse</label><input type="range" id="rwSpeed" min="20" max="100" value="40" style="flex:1"><span class="sub" id="rwSpeedV">40 %</span></div>
<div class="actions"><button type="button" data-turn="45">⟲ 45°</button><button type="button" data-turn="15">⟲ 15°</button><button type="button" data-turn="-15">15° ⟳</button><button type="button" data-turn="-45">45° ⟳</button></div>
<label class="sub" style="display:block;margin-top:8px"><input type="checkbox" id="rwLive" checked> Aperçu LiDAR en direct dans la vue</label>
<label class="sub" style="display:block;margin-top:8px"><input type="checkbox" id="rwAuto"> Auto-SLAM : après chaque déplacement, prendre un scan et l’ajouter si le recalage est fiable</label>
<label class="sub" style="display:block;margin-top:6px"><input type="checkbox" id="rwKeepRejected" checked> Garder les scans refusés en attente de recalage automatique</label>
<div class="actions"><button type="button" class="primary" id="rwCapture">Capturer et ajouter à la carte</button><button type="button" id="rwUndo">Annuler le dernier scan</button><button type="button" id="rwRelocate">Recalculer les poses</button><button type="button" id="rwNew">Nouvelle séance</button></div>
<div class="sub" id="rwMsg" style="margin-top:8px">Les scans pris ici ou depuis le téléphone (version reliée au PC) sont enregistrés dans le dossier ci-dessus. En Auto-SLAM, chaque arrêt après déplacement lance une capture et un recalage; les poses incertaines restent hors de la carte.</div>
<div class="sub" id="rwPhone" style="margin-top:6px"></div>`;
    const first = document.querySelector("aside .card");
    if (first && first.parentNode) first.parentNode.insertBefore(card, first.nextSibling);
    else document.body.prepend(card);
    const q = (id) => document.getElementById(id);
    const msg = (t) => (q("rwMsg").textContent = t);
    q("rwSpeed").oninput = () => (q("rwSpeedV").textContent = q("rwSpeed").value + " %");
    q("rwPhone").textContent = "Téléphone : connecte-le au même réseau local que le PC et ouvre l’adresse « Téléphone » affichée par le serveur. Le PC peut être relié à la box par Ethernet.";

    // ---------- pilotage ----------
    const held = new Set();
    let stops = 0,
      busyDrive = false,
      busy = false,
      autoCaptureBusy = false;
    function speeds() {
      const v = +q("rwSpeed").value,
        f = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0),
        t = ((held.has("left") ? 1 : 0) - (held.has("right") ? 1 : 0)) * (f ? 0.5 : 0.6);
      let l = f - t,
        r = f + t;
      const m = Math.max(1, Math.abs(l), Math.abs(r));
      return [Math.round((l / m) * v), Math.round((r / m) * v)];
    }
    setInterval(async () => {
      if (busyDrive) return;
      busyDrive = true;
      try {
        if (held.size) {
          const [l, r] = speeds();
          await get("/api/robot/drive?l=" + l + "&r=" + r, 800);
        } else if (stops > 0) {
          stops--;
          await get("/api/robot/release", 800);
        }
      } catch (e) {}
      busyDrive = false;
    }, 120);
    const autoSlam = LidarAutoSlam.createAutoSlam({
      enabled: () => q("rwAuto").checked,
      blocked: () => held.size > 0 || autoCaptureBusy || busy,
      capture: async () => {
        autoCaptureBusy = true;
        busy = true;
        q("rwCapture").disabled = true;
        card.querySelectorAll(".actions button").forEach((b) => (b.disabled = true));
        msg("Robot arrêté · attente du tour LiDAR complet, puis recalage sur la carte…");
        try {
          const r = await post("/api/capture", { auto: true, keepRejected: q("rwKeepRejected").checked });
          await sync(r.session);
          if (!r.scan.discarded) select(scans.findIndex((s) => s.serverName === r.scan.name));
          msg(r.ok
            ? "Auto-SLAM · scan intégré : " + r.scan.note + (r.retried ? " · " + r.retried + " ancien(s) scan(s) recalé(s) aussi." : "") + " Tu peux déplacer le robot."
            : r.scan.discarded
              ? "Auto-SLAM · pose refusée (" + r.scan.note + "); scan non conservé. Reste dans une zone qui recouvre la carte puis réessaie."
              : "Auto-SLAM · scan conservé en attente : " + r.scan.note + ". Il sera recalé après un prochain scan accepté.");
        } catch (e) {
          msg("Auto-SLAM · capture impossible : " + e.message + ". Vérifie la connexion du robot puis réessaie.");
        } finally {
          autoCaptureBusy = false;
          busy = false;
          card.querySelectorAll(".actions button").forEach((b) => (b.disabled = false));
        }
      },
    });
    function scheduleAutoCapture(delay = 500) { autoSlam.schedule(delay); }
    const press = (k) => {
      // pas de déplacement pendant une capture : le robot doit rester immobile pendant les tours du LiDAR
      if (busy || autoCaptureBusy) {
        msg("Capture en cours : attends la fin du recalage avant de déplacer le robot.");
        return;
      }
      autoSlam.cancel();
      held.add(k);
    },
      unpress = (k) => {
        if (held.delete(k) && !held.size) {
          stops = 3;
          scheduleAutoCapture();
        }
      };
    function stopNow(captureAfterStop = false) {
      const wasMoving = held.size > 0;
      held.clear();
      stops = 0;
      const stopped = get("/api/robot/stop", 800).catch(() => {});
      if (wasMoving && captureAfterStop) scheduleAutoCapture();
      return stopped;
    }
    card.querySelectorAll("[data-move]").forEach((b) => {
      const k = b.dataset.move;
      b.addEventListener("pointerdown", (e) => {
        b.setPointerCapture(e.pointerId);
        press(k);
      });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => unpress(k));
    });
    q("rwStop").onclick = () => stopNow(true);
    const KEYS = { ArrowUp: "up", z: "up", Z: "up", w: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", q: "left", Q: "left", a: "left", ArrowRight: "right", d: "right", D: "right" };
    const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || "") && document.activeElement.type !== "checkbox" && document.activeElement.type !== "range";
    addEventListener("keydown", (e) => {
      if (!q("rwKeys").checked || typing()) return;
      if (e.key === " ") {
        e.preventDefault();
        stopNow(true);
        return;
      }
      if (KEYS[e.key]) {
        e.preventDefault();
        press(KEYS[e.key]);
      }
    });
    addEventListener("keyup", (e) => KEYS[e.key] && unpress(KEYS[e.key]));
    addEventListener("blur", () => held.size && (held.clear(), (stops = 3), scheduleAutoCapture()));
    card.querySelectorAll("[data-turn]").forEach(
      (b) =>
        (b.onclick = async () => {
          await stopNow(false);
          try {
            const ms = await get("/api/robot/turn?deg=" + b.dataset.turn, 1500);
            msg("Rotation de " + Math.abs(+b.dataset.turn) + "° (" + ms + " ms). L’angle exact sera retrouvé par le recalage.");
            scheduleAutoCapture((+ms || 0) + 500); // durée de la rotation + rampe d'arrêt (120 ms) + marge
          } catch (e) {
            msg("Rotation impossible : " + e.message);
          }
        })
    );

    // ---------- aperçu en direct (même affichage que la capture USB / Wi-Fi de Lidar Lab) ----------
    let robotOk = false,
      lastLiveId = "";
    (async function live() {
      for (;;) {
        if (q("rwLive").checked) {
          try {
            const raw = await get("/api/robot/scan", 2500),
              m = raw.match(/id=(\d+)/);
            robotOk = true;
            if (m && m[1] !== lastLiveId) {
              lastLiveId = m[1];
              const scan = parseCsv(raw, "apercu_robot.csv");
              if (scan.pts.length >= 50) {
                scan.rawCsv = raw;
                scan.serialFrameId = ++serialFrameCounter;
                livePreviewScan = scan;
                draw();
              }
            }
          } catch (e) {
            robotOk = false;
          }
        } else if (livePreviewScan && livePreviewScan.name === "apercu_robot.csv") {
          livePreviewScan = null;
          draw();
        }
        await sleep(robotOk ? 300 : 1500);
      }
    })();

    // ---------- séance du PC -> liste des scans de Lidar Lab ----------
    let version = -1,
      pcOk = true;
    async function sync(j) {
      version = j.version;
      q("rwFolder").textContent = "Séance " + j.name + " · enregistrée dans " + j.dossier;
      let changed = false;
      const names = new Set(j.scans.map((e) => e.name));
      for (let i = scans.length - 1; i >= 0; i--)
        if (scans[i].serverName && !names.has(scans[i].serverName)) {
          scans.splice(i, 1);
          changed = true;
        }
      for (const e of j.scans) {
        let s = scans.find((x) => x.serverName === e.name);
        if (!s) {
          const text = await get("/api/scan/" + encodeURIComponent(e.name), 5000);
          s = parseCsv(text, e.name);
          s.rawCsv = text;
          s.serverName = e.name;
          scans.push(s);
          changed = true;
        }
        const reg = !!e.reg;
        if (String(s.pose) !== String(e.pose) || s.mapRegistered !== reg || !!s.isAnchor !== !!e.anchor) {
          s.pose = [...e.pose];
          s.mapRegistered = reg;
          s.visible = reg;
          s.isAnchor = !!e.anchor;
          changed = true;
        }
        s.serverNote = e.note;
      }
      if (changed) {
        if (active >= scans.length) active = Math.max(0, scans.length - 1);
        renderSelectors();
      }
      const reg = j.scans.filter((e) => e.reg).length;
      q("rwStatus").textContent = "PC ✓ · robot " + (robotOk ? "✓" : "✗ (" + j.robot.url + ")") + " · " + reg + "/" + j.scans.length + " scans intégrés";
    }
    (async function poll() {
      for (;;) {
        try {
          const j = JSON.parse(await get("/api/session", 3000));
          pcOk = true;
          if (j.version !== version && !busy) await sync(j);
          else q("rwStatus").textContent = q("rwStatus").textContent.replace(/robot [✓✗][^·]*/, "robot " + (robotOk ? "✓ " : "✗ "));
        } catch (e) {
          if (pcOk) q("rwStatus").textContent = "Serveur PC arrêté : relance node serveur_robot/serveur.js";
          pcOk = false;
        }
        await sleep(1000);
      }
    })();
    async function act(fn, waitMsg) {
      if (busy) return;
      busy = true;
      card.querySelectorAll(".actions button").forEach((b) => (b.disabled = true));
      try {
        if (waitMsg) msg(waitMsg);
        return await fn();
      } catch (e) {
        msg("Impossible : " + e.message);
      } finally {
        busy = false;
        card.querySelectorAll(".actions button").forEach((b) => (b.disabled = false));
      }
    }
    q("rwCapture").onclick = () =>
      act(async () => {
        await get("/api/robot/release", 800).catch(() => {});
        const r = await post("/api/capture");
        await sync(r.session);
        const n = r.session.scans.length;
        select(scans.findIndex((s) => s.serverName === r.scan.name));
        msg(r.ok ? "Scan " + n + " intégré (" + r.scan.note + ") et enregistré sur le disque." : "Scan " + n + " enregistré mais " + r.scan.note + ". Reviens vers une zone déjà cartographiée puis recapture.");
      }, "Capture et recalage…");
    q("rwUndo").onclick = () => act(async () => (await sync(await post("/api/undo")), msg("Dernier scan retiré de la séance (son fichier CSV reste sur le disque).")));
    q("rwRelocate").onclick = () => act(async () => (await sync(await post("/api/relocate")), msg("Poses recalculées sur le PC.")), "Recalcul de toutes les poses…");
    q("rwNew").onclick = () => {
      if (confirm("Commencer une nouvelle séance ? L’ancienne reste enregistrée sur le disque.")) act(async () => (await sync(await post("/api/new")), msg("Nouvelle séance créée.")));
    };
    void status;
  }
  setTimeout(init, 0);
})();
