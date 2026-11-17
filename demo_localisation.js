"use strict";
// Démo « Où le robot a-t-il pris ce scan ? » (Lidar Lab)
// 1. on choisit un scan enregistré au hasard ; il est retiré de la carte, ainsi que les scans pris au même
//    endroit (moins de 15 cm), pour que la carte ne le contienne pas déjà ;
// 2. « Localiser en direct » : recherche de sa pose sur TOUTE la grid map, sur 360°, sans position de départ
//    (LidarCore.locateScanOnGrid ; refus si recouvrement < « Recouvrement min » ou si une autre position est
//    presque aussi bonne). Le test « contradiction avec l'espace libre » de l'assemblage n'est PAS utilisé :
//    sur la séance réelle du 10/11, il refusait 33 bonnes poses sur 48 (seuil réglé sur le 04/11) ;
// 3. affichage des coordonnées trouvées et de l'écart avec la pose enregistrée par l'Auto-SLAM (qui n'est pas
//    une vérité terrain). La pose enregistrée du scan n'est jamais modifiée.
(function () {
  if (typeof scans === "undefined" || typeof LidarCore === "undefined") return;
  const SAME_SPOT = 0.15;
  let demo = null,
    view = null;
  // cadrage : centre la vue sur le point (x, y) de la carte avec le zoom z (garde le même repère que draw())
  function frame(x, y, z) {
    if (!view) return;
    camera.zoom = z;
    camera.dx = view.w / 2 - view.ox - (x - view.minX) * view.scale * z;
    camera.dy = view.h - view.h / 2 - view.oy - (y - view.minY) * view.scale * z;
    draw();
  }

  const panel = document.createElement("div");
  panel.id = "demoLoc";
  panel.style.cssText =
    "position:fixed;right:14px;bottom:14px;width:340px;z-index:50;background:#141c27;border:2px solid #f2c94c;border-radius:10px;padding:10px 12px;color:#e8eef6;font:13px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px #0008";
  panel.innerHTML =
    '<div style="font-weight:700;color:#f2c94c;margin-bottom:4px">Où le robot a-t-il pris ce scan ?</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0">' +
    '<button type="button" id="demoPick">1 · Scan au hasard</button>' +
    '<button type="button" id="demoLocate" class="primary" disabled>2 · Localiser en direct</button>' +
    '<button type="button" id="demoReset">Remettre la carte</button></div>' +
    '<div style="color:#9aabc0;font-size:12px">Règles : recouvrement ≥ 35 %, aucune autre position presque aussi bonne. Données : scans enregistrés (pas le robot en direct).</div>' +
    '<div id="demoStatus" style="min-height:54px;margin-top:4px">Charge une séance (scans recalés), puis choisis un scan au hasard.</div>';
  document.body.appendChild(panel);
  const st = (h) => (document.getElementById("demoStatus").innerHTML = h);
  const fmt = (p) => "x = " + p[0].toFixed(3) + " m · y = " + p[1].toFixed(3) + " m · θ = " + (((p[2] % 360) + 540) % 360 - 180).toFixed(1) + "°";

  function restore() {
    if (!demo) return;
    for (const [s, v] of demo.hidden) s.visible = v;
    importedGrid = demo.prevGrid;
    demo = null;
    document.getElementById("demoLocate").disabled = true;
    renderList();
    draw();
  }

  // choix au hasard (ou un scan donné par son nom, pour les tests)
  function pick(name) {
    restore();
    const cands = scans.filter((s) => s.mapRegistered && s.pose && s.frame !== "world");
    if (cands.length < 5) return st("Il faut au moins 5 scans recalés (charge une séance du robot).");
    const target = (typeof name === "string" && cands.find((s) => s.name === name)) || cands[Math.floor(Math.random() * cands.length)];
    // carte de la recherche : grid map des scans recalés SAUF le scan choisi et ceux pris au même endroit.
    // Pendant la démo, l'outil n'affiche QUE cette grid map (les scans eux-mêmes sont masqués).
    const excluded = scans.filter((s) => s === target || (s.mapRegistered && Math.hypot(s.pose[0] - target.pose[0], s.pose[1] - target.pose[1]) < SAME_SPOT));
    const res = gridResolutionSetting(),
      g = LidarCore.cellsToGrid(LidarCore.computeGridCells(scans.filter((s) => s.mapRegistered && !excluded.includes(s)), filteredScanPoints, res), res);
    const hidden = scans.map((s) => [s, s.visible]);
    scans.forEach((s) => (s.visible = false));
    demo = { target, recorded: [...target.pose], hidden, result: null, prevGrid: importedGrid, excluded: excluded.length };
    importedGrid = { name: "Grid map sans le scan choisi", rows: g.rows, resolution: res, origin: g.origin, width: g.width, height: g.height, originKnown: true };
    document.getElementById("layer").value = "grid";
    document.getElementById("demoLocate").disabled = false;
    renderList();
    draw();
    st("Scan choisi : <b>" + target.name + "</b><br>Il est retiré de la carte" + (demo.excluded > 1 ? " (avec " + (demo.excluded - 1) + " scan(s) pris au même endroit)" : "") + ". En haut à gauche : ce que voyait le robot. Sa position est inconnue de la recherche.");
  }

  async function locate() {
    if (!demo) return;
    document.getElementById("demoLocate").disabled = true;
    st("Localisation en cours : recherche sur <b>toute</b> la grid map, sur 360°, sans position de départ…");
    demo.searching = true;
    draw();
    await new Promise((r) => setTimeout(r, 60));
    const g = importedGrid,
      minOverlap = Math.min(1, Math.max(0.05, (Number(document.getElementById("minOverlap")?.value) || 35) / 100)),
      t0 = performance.now();
    const r = LidarCore.locateScanOnGrid(filteredScanPoints(demo.target), g, { minOverlap, overlapAmbiguity: true });
    const ms = performance.now() - t0;
    demo.searching = false;
    demo.result = r;
    draw();
    const pct = (v) => (v * 100).toFixed(0) + " %";
    if (!r.ok) {
      const why = r.ambiguous ? "plusieurs positions possibles : le robot préfère ne pas choisir" : "trop peu de points sur des murs connus";
      return st("Recherche terminée en " + (ms / 1000).toFixed(1) + " s : <b style=\"color:#ff8b8b\">position refusée</b> — " + why + (Number.isFinite(r.overlap) ? " (recouvrement " + pct(r.overlap) + ")" : "") + ".");
    }
    const p = r.pose,
      q = demo.recorded,
      dxy = Math.hypot(p[0] - q[0], p[1] - q[1]),
      dth = Math.abs((((p[2] - q[2]) % 360) + 540) % 360 - 180);
    st(
      "Trouvé en " + (ms / 1000).toFixed(1) + " s · recouvrement " + pct(r.overlap) + "<br>" +
        '<b style="color:#f2c94c">Position du robot : ' + fmt(p) + "</b><br>" +
        '<span style="color:#68ddd1">Pose enregistrée (Auto-SLAM) : ' + fmt(q) + "</span><br>" +
        "Écart : <b>" + (dxy * 100).toFixed(1) + " cm</b> et <b>" + dth.toFixed(1) + "°</b> (l'Auto-SLAM n'est pas une vérité terrain)"
    );
  }

  // dessin par-dessus la carte : même repère écran que draw()
  function overlay() {
    const cv = document.getElementById("plot"),
      ctx = cv.getContext("2d"),
      r = cv.getBoundingClientRect();
    if (!r.width || !demo) return;
    const visible = scans.filter((s) => s.visible),
      bounds = visible.flatMap((s) => filteredMapPoints(s).map((q) => transformed(q, s.pose)));
    if (importedGrid) {
      const [ox, oy] = importedGrid.origin;
      bounds.push([ox, oy], [ox + importedGrid.width * importedGrid.resolution, oy + importedGrid.height * importedGrid.resolution]);
    }
    if (!bounds.length) return;
    const minX = Math.min(...bounds.map((p) => p[0])) - 0.5,
      maxX = Math.max(...bounds.map((p) => p[0])) + 0.5,
      minY = Math.min(...bounds.map((p) => p[1])) - 0.5,
      maxY = Math.max(...bounds.map((p) => p[1])) + 0.5,
      scale = Math.min((r.width - 50) / (maxX - minX), (r.height - 50) / (maxY - minY)),
      ox = (r.width - (maxX - minX) * scale) / 2,
      oy = (r.height - (maxY - minY) * scale) / 2,
      xy = (x, y) => [ox + camera.dx + (x - minX) * scale * camera.zoom, r.height - (oy + camera.dy + (y - minY) * scale * camera.zoom)];
    view = { minX, minY, scale, ox, oy, w: r.width, h: r.height };
    const pts = filteredScanPoints(demo.target);
    // quadrillage d'un mètre avec les coordonnées sur les bords : on lit où se trouve le robot
    {
      const [x0w, y0w] = [minX + (-ox - camera.dx) / (scale * camera.zoom), minY + (-oy - camera.dy) / (scale * camera.zoom)];
      const [x1w, y1w] = [x0w + r.width / (scale * camera.zoom), y0w + r.height / (scale * camera.zoom)];
      ctx.save();
      ctx.strokeStyle = "rgba(154,171,192,0.18)";
      ctx.fillStyle = "#9aabc0";
      ctx.font = "11px system-ui";
      ctx.lineWidth = 1;
      for (let gx = Math.ceil(x0w); gx <= x1w; gx++) {
        const [sx] = xy(gx, 0);
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, r.height); ctx.stroke();
        ctx.fillText(gx + " m", sx + 2, r.height - 6);
      }
      for (let gy = Math.ceil(y0w); gy <= y1w; gy++) {
        const [, sy] = xy(0, gy);
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(r.width, sy); ctx.stroke();
        ctx.fillText(gy + " m", 4, sy - 3);
      }
      ctx.restore();
    }
    // encadré : le scan tel que vu par le robot (repère du robot)
    const B = 210, bx = 12, by = 28, k = B / 2 / 6;
    ctx.fillStyle = "#0b1017ee";
    ctx.fillRect(bx, by, B, B + 18);
    ctx.strokeStyle = "#f2c94c";
    ctx.strokeRect(bx, by, B, B + 18);
    ctx.fillStyle = "#f2c94c";
    ctx.font = "12px system-ui";
    ctx.fillText("Scan choisi : " + demo.target.name.replace(/\.csv$/i, ""), bx + 6, by + 14);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by + 18, B, B);
    ctx.clip();
    for (const p of pts) ctx.fillRect(bx + B / 2 + p.x * k - 1, by + 18 + B / 2 - p.y * k - 1, 2, 2);
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bx + B / 2, by + 18 + B / 2, 4, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(bx + B / 2, by + 18 + B / 2);
    ctx.lineTo(bx + B / 2 + 16, by + 18 + B / 2);
    ctx.stroke();
    if (demo.searching) {
      ctx.fillStyle = "#f2c94c";
      ctx.font = "bold 16px system-ui";
      ctx.fillText("Recherche sur toute la carte…", r.width / 2 - 110, 26);
    }
    const res = demo.result;
    if (!res) return;
    // pose enregistrée par l'Auto-SLAM (comparaison)
    const [qx, qy] = xy(demo.recorded[0], demo.recorded[1]);
    ctx.strokeStyle = "#68ddd1";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(qx, qy, 16, 0, 7);
    ctx.stroke();
    ctx.lineWidth = 1;
    if (!res.ok || !res.pose) return;
    // le scan placé à la position trouvée
    ctx.fillStyle = "#f2c94c";
    for (const p of pts) {
      const [x, y] = xy(...transformed(p, res.pose));
      ctx.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
    }
    const [x, y] = xy(res.pose[0], res.pose[1]),
      a = (res.pose[2] * Math.PI) / 180;
    // lignes de repère jusqu'aux bords (lecture des coordonnées sur le quadrillage)
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(242,201,76,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, r.height); ctx.moveTo(x, y); ctx.lineTo(0, y); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#f2c94c";
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#f2c94c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 42 * Math.cos(a), y - 42 * Math.sin(a));
    ctx.stroke();
    ctx.lineWidth = 1;
    // cadre « Robot ici » près du robot
    const label = "Robot ici : x = " + res.pose[0].toFixed(2) + " m, y = " + res.pose[1].toFixed(2) + " m, θ = " + ((((res.pose[2] % 360) + 540) % 360) - 180).toFixed(0) + "°";
    ctx.font = "bold 16px system-ui";
    const tw = ctx.measureText(label).width,
      lx = Math.min(r.width - tw - 24, x + 20),
      ly = Math.max(30, y - 46);
    ctx.fillStyle = "#0b1017ee";
    ctx.fillRect(lx - 8, ly - 20, tw + 16, 30);
    ctx.strokeStyle = "#f2c94c";
    ctx.lineWidth = 2;
    ctx.strokeRect(lx - 8, ly - 20, tw + 16, 30);
    ctx.lineWidth = 1;
    ctx.fillStyle = "#f2c94c";
    ctx.fillText(label, lx, ly);
  }

  const baseDraw = draw;
  draw = function () {
    baseDraw();
    try {
      overlay();
    } catch (e) {
      console.error(e);
    }
  };
  document.getElementById("demoPick").onclick = pick;
  document.getElementById("demoLocate").onclick = locate;
  document.getElementById("demoReset").onclick = () => (restore(), st("Carte remise. Choisis un autre scan au hasard."));
  window.demoLocalisation = { pick, locate, restore, frame, state: () => demo };
})();
