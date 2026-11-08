/* Lidar Lab V1 — fonctions de calcul sans DOM, extraites de index.html pour être testées sous Node.
   Le navigateur les charge via <script src="lidar_core.js"> (objet global LidarCore);
   Node les charge via require("./lidar_core.js"). Aucune donnée n'est envoyée en ligne. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LidarCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Lit un CSV de scan (LD06, RobotControl, MapTool, printScanCSV, nuage x_m/y_m).
      Les données brutes (rawPts, et rawCsv ajouté par l'appelant) ne sont jamais modifiées ensuite. */
  function parseCsv(text, name) {
    let ac = 0,
      rc = 1,
      scale = 0.001,
      ic = 2,
      xc = -1,
      yc = -1,
      mode = "polar",
      pose = [0, 0, 0],
      rows = [],
      withIntensity = 0;
    for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith("#")) {
        const m = l.match(/robot\s+position:\s*x\s*=\s*([-+\d.eE]+)\s*m\s*,\s*y\s*=\s*([-+\d.eE]+)\s*m\s*,\s*theta\s*=\s*([-+\d.eE]+)\s*deg/i);
        if (m) pose = [+m[1], +m[2], +m[3]];
        continue;
      }
      const delim = l.includes(";") ? ";" : ",";
      const c = l.split(delim).map((s) => s.trim());
      // colonne absente -> NaN (avant : exception avec le séparateur « ; »)
      const num = (v) => (v === undefined ? NaN : Number(delim === ";" ? v.replace(",", ".") : v));
      const hasI = () => ic >= 0 && c[ic] !== undefined && c[ic] !== "";
      const h = c.map((x) => x.toLowerCase());
      const hasHeader =
        h.some((x) => ["angle_deg", "distance_mm", "distance_m", "r_m", "x_m", "y_m", "x_rel_m", "y_rel_m", "intensity", "point"].includes(x)) || h[0] === "n";
      if (hasHeader) {
        if (h.includes("x_rel_m") && h.includes("y_rel_m")) {
          mode = "local";
          xc = h.indexOf("x_rel_m");
          yc = h.indexOf("y_rel_m");
          ic = h.indexOf("intensity");
        } else if (h.includes("x_m") && h.includes("y_m")) {
          mode = "world";
          xc = h.indexOf("x_m");
          yc = h.indexOf("y_m");
          ic = h.indexOf("intensity");
        } else if (h.includes("x") && h.includes("y") && (h.includes("scan") || h.includes("point"))) {
          mode = "world";
          xc = h.indexOf("x");
          yc = h.indexOf("y");
          ic = h.indexOf("intensity");
        } else if (h[0] === "n") {
          mode = "polar";
          ac = 1;
          rc = 2;
          scale = 0.001;
          ic = 3;
        } else if (h.includes("angle_deg")) {
          mode = "polar";
          ac = h.indexOf("angle_deg");
          if (h.includes("distance_mm")) {
            rc = h.indexOf("distance_mm");
            scale = 0.001;
          } else if (h.includes("distance_m")) {
            rc = h.indexOf("distance_m");
            scale = 1;
          } else if (h.includes("r_m")) {
            rc = h.indexOf("r_m");
            scale = 1;
          }
          ic = h.indexOf("intensity");
        }
        continue;
      }
      if (mode === "world" || mode === "local") {
        const x = num(c[xc]),
          y = num(c[yc]);
        if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 10000 && Math.abs(y) < 10000 && (mode !== "local" || Math.hypot(x, y) > 0.05)) {
          if (hasI()) withIntensity++;
          rows.push({ x, y, r: Math.hypot(x, y), i: ic >= 0 ? num(c[ic]) || 0 : 0 });
        }
        continue;
      }
      const a = num(c[ac]),
        r = num(c[rc]) * scale;
      if (Number.isFinite(a) && Number.isFinite(r) && r > 0.05 && r < 15) {
        if (hasI()) withIntensity++;
        rows.push({ x: r * Math.cos((a * Math.PI) / 180), y: r * Math.sin((a * Math.PI) / 180), r, i: ic >= 0 ? num(c[ic]) || 0 : 0 });
      }
    }
    return {
      name,
      pts: rows,
      rawPts: rows,
      pose,
      visible: true,
      frame: mode === "world" ? "world" : "local",
      mapRegistered: false,
      // false si aucune ligne n'a de colonne d'intensité (Teleplot, MapTool…) : le seuil d'intensité ne s'applique pas
      hasIntensity: withIntensity > 0,
    };
  }

  /** Lit une grid map CSV (-1/0/1 ou 0/1 MapTool). fallbackOrigin sert si le fichier n'indique pas son origine. */
  function parseGridCsv(text, name, fallbackOrigin = [0, 0]) {
    let resolution = null,
      ox = null,
      oy = null,
      rows = [],
      sawGridHint = false;
    for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith("#")) {
        if (/grid\s*map/i.test(l)) sawGridHint = true;
        let m = l.match(/(?:resolution_m|cell(?:_m)?)\s*=\s*([-+\d.eE]+)/i);
        if (m) resolution = +m[1];
        m = l.match(/origin_x_m\s*=\s*([-+\d.eE]+)/i);
        if (m) ox = +m[1];
        m = l.match(/origin_y_m\s*=\s*([-+\d.eE]+)/i);
        if (m) oy = +m[1];
        m = l.match(/origin\s*=\s*\(\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*\)/i);
        if (m) {
          ox = +m[1];
          oy = +m[2];
        }
        continue;
      }
      const values = l.split(l.includes(";") ? ";" : ",").map((v) => Number(v.trim().replace(",", ".")));
      if (values.length < 2 || values.some((v) => !Number.isFinite(v) || ![-1, 0, 1].includes(v))) return null;
      rows.push(values);
    }
    if (rows.length < 2 || !rows[0].length || rows.some((r) => r.length !== rows[0].length) || !Number.isFinite(resolution) || resolution <= 0) return null;
    if (!sawGridHint && !/grid.?map/i.test(name) && ox === null && oy === null) return null;
    const originKnown = Number.isFinite(ox) && Number.isFinite(oy),
      origin = originKnown ? [ox, oy] : [Number(fallbackOrigin[0]) || 0, Number(fallbackOrigin[1]) || 0];
    return { name, rows, resolution, origin, originKnown, width: rows[0].length, height: rows.length };
  }

  /** Point du repère scan -> repère carte, pose [x_m, y_m, theta_deg]. */
  function transformed(pt, p) {
    let a = (p[2] * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    return [c * pt.x - s * pt.y + p[0], s * pt.x + c * pt.y + p[1]];
  }

  /** Nettoyage portée/intensité. Renvoie un NOUVEAU tableau; rawPts n'est jamais modifié.
      settings = {minRange, maxRange, minIntensity}. */
  function filterScanPoints(scan, settings) {
    const min = settings.minRange,
      max = settings.maxRange,
      minI = Math.max(0, settings.minIntensity || 0),
      // un scan sans colonne d'intensité ne doit pas perdre tous ses points
      useIntensity = minI > 0 && scan.hasIntensity !== false,
      points = scan.rawPts || scan.pts;
    return points.filter((p) => (scan.frame === "world" || (p.r >= min && p.r <= max)) && (!useIntensity || (Number(p.i) || 0) >= minI));
  }

  /** Scan initial du relevé : celui ancré explicitement, sinon le premier intégré. */
  function findAnchor(scans) {
    return scans.find((s) => s.mapRegistered && s.isAnchor) || scans.find((s) => s.mapRegistered);
  }

  /** Filtre temporel : garde le scan initial intact; dans les autres scans intégrés, ne garde que les retours
      confirmés (à moins de `tolerance` m) par un autre scan visible intégré.
      opts = {enabled, tolerance, filter: settings de filterScanPoints}. */
  function temporalFilter(scan, scans, opts) {
    const points = filterScanPoints(scan, opts.filter);
    if (!opts.enabled || !scan.mapRegistered) return points;
    const anchor = findAnchor(scans);
    if (scan === anchor) return points;
    const others = scans.filter((s) => s !== scan && s.visible && s.mapRegistered);
    if (!others.length) return points;
    const tol = Math.max(0.05, Number(opts.tolerance) || 0.18),
      cell = tol,
      bins = new Map();
    for (const other of others)
      for (const p of filterScanPoints(other, opts.filter)) {
        const [x, y] = transformed(p, other.pose),
          key = Math.floor(x / cell) + "," + Math.floor(y / cell);
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push([x, y]);
      }
    return points.filter((p) => {
      const [x, y] = transformed(p, scan.pose),
        cx = Math.floor(x / cell),
        cy = Math.floor(y / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) for (const q of bins.get(cx + dx + "," + (cy + dy)) || []) if (Math.hypot(x - q[0], y - q[1]) <= tol) return true;
      return false;
    });
  }

  const LO = -4,
    HI = 4,
    FREE_STEP = 0.4,
    HIT_STEP = 0.85;

  /** Grid map log-odds (Bresenham) : cellules traversées libres, cellule d'impact occupée.
      pointsFor(scan) donne les points (repère scan) à utiliser pour chaque scan. */
  function computeGridCells(scanList, pointsFor, res) {
    const cells = new Map();
    function update(x, y, d) {
      const k = `${x},${y}`,
        v = Math.max(LO, Math.min(HI, (cells.get(k) || 0) + d));
      cells.set(k, v);
    }
    for (const scan of scanList) {
      const a = Math.floor(scan.pose[0] / res),
        b = Math.floor(scan.pose[1] / res);
      for (const q of pointsFor(scan)) {
        const end = transformed(q, scan.pose),
          x1 = Math.floor(end[0] / res),
          y1 = Math.floor(end[1] / res);
        let x = a,
          y = b,
          dx = Math.abs(x1 - x),
          sx = x < x1 ? 1 : -1,
          dy = -Math.abs(y1 - y),
          sy = y < y1 ? 1 : -1,
          err = dx + dy;
        while (x !== x1 || y !== y1) {
          update(x, y, -FREE_STEP);
          const e = 2 * err;
          if (e >= dy) {
            err += dy;
            x += sx;
          }
          if (e <= dx) {
            err += dx;
            y += sy;
          }
        }
        update(x1, y1, HIT_STEP);
      }
    }
    return cells;
  }

  /** État d'une cellule : 1 occupé (p > 0.62), 0 libre (p < 0.38), -1 inconnu. */
  function cellState(L) {
    if (L === undefined) return -1;
    const prob = 1 / (1 + Math.exp(-L));
    return prob > 0.62 ? 1 : prob < 0.38 ? 0 : -1;
  }

  /** Matrice du haut vers le bas, origine = coin bas-gauche de la cellule (xmin, ymin). */
  function cellsToGrid(cells, res) {
    if (!cells.size) return null;
    const coords = [...cells.keys()].map((k) => k.split(",").map(Number)),
      xs = coords.map((p) => p[0]),
      ys = coords.map((p) => p[1]),
      xmin = Math.min(...xs),
      xmax = Math.max(...xs),
      ymin = Math.min(...ys),
      ymax = Math.max(...ys),
      width = xmax - xmin + 1,
      height = ymax - ymin + 1,
      rows = Array.from({ length: height }, () => Array(width).fill(-1));
    let occupied = 0;
    for (const [key, L] of cells) {
      const [x, y] = key.split(",").map(Number),
        value = cellState(L);
      rows[ymax - y][x - xmin] = value;
      if (value === 1) occupied++;
    }
    return { rows, resolution: res, origin: [xmin * res, ymin * res], width, height, occupied };
  }

  function gridToCsv(g) {
    return [
      `# resolution_m=${g.resolution} origin_x_m=${g.origin[0]} origin_y_m=${g.origin[1]} rows=top_to_bottom; -1=unknown, 0=free, 1=occupied`,
      ...g.rows.map((r) => r.join(",")),
    ].join("\n");
  }
  function gridToMapToolCsv(g) {
    const h = g.rows.length,
      w = g.rows[0].length;
    return [
      `# Grid map ${w}x${h}, cell=${g.resolution} m ; 1=occupied,0=free`,
      `# origin=(${g.origin[0]},${g.origin[1]}) m : bas-gauche de la cellule (0,0), lignes du haut vers le bas`,
      ...g.rows.map((r) => r.map((v) => (v === 1 ? 1 : 0)).join(",")),
    ].join("\n");
  }

  const angleDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

  /** Localisation globale d'un scan sur une grid map (recherche sur toute la carte puis affinage).
      Le choix et l'acceptation de la pose utilisent un score robuste : les retours d'une zone nouvelle
      ou d'une personne ne comptent que comme « non recouverts », sans faire exploser l'erreur.
      options.minOverlap = part minimale des points à moins de max(10 cm, 2 cellules) d'un mur de la carte.
      Renvoie {ok, reason, pose:[x,y,deg], mean, overlap, inlierRms, gap, ambiguous, quality}. */
  function locateScanOnGrid(targetPoints, grid, options = {}) {
    const minOverlap = Number.isFinite(options.minOverlap) ? options.minOverlap : 0.35;
    const occupied = [];
    for (let r = 0; r < grid.height; r++) for (let c = 0; c < grid.width; c++) if (grid.rows[r][c] === 1) occupied.push(r * grid.width + c);
    if (occupied.length < 10) return { ok: false, reason: "grille_vide" };
    const w = grid.width,
      h = grid.height,
      res = grid.resolution,
      dist = new Float32Array(w * h);
    dist.fill(32);
    for (const i of occupied) dist[i] = 0;
    const d1 = 1,
      d2 = Math.SQRT2;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        let i = r * w + c,
          v = dist[i];
        if (c) v = Math.min(v, dist[i - 1] + d1);
        if (r) {
          v = Math.min(v, dist[i - w] + d1);
          if (c) v = Math.min(v, dist[i - w - 1] + d2);
          if (c + 1 < w) v = Math.min(v, dist[i - w + 1] + d2);
        }
        dist[i] = v;
      }
    for (let r = h - 1; r >= 0; r--)
      for (let c = w - 1; c >= 0; c--) {
        let i = r * w + c,
          v = dist[i];
        if (c + 1 < w) v = Math.min(v, dist[i + 1] + d1);
        if (r + 1 < h) {
          v = Math.min(v, dist[i + w] + d1);
          if (c + 1 < w) v = Math.min(v, dist[i + w + 1] + d2);
          if (c) v = Math.min(v, dist[i + w - 1] + d2);
        }
        dist[i] = v;
      }
    const points = targetPoints.filter((_, i) => i % Math.max(1, Math.floor(targetPoints.length / 110)) === 0),
      ox = grid.origin[0],
      oy = grid.origin[1],
      maxD = 1.2;
    function distanceAt(x, y, a, p) {
      const c = Math.cos(a),
        sn = Math.sin(a),
        wx = x + c * p.x - sn * p.y,
        wy = y + sn * p.x + c * p.y,
        col = Math.floor((wx - ox) / res),
        iy = Math.floor((wy - oy) / res),
        row = h - 1 - iy;
      if (col >= 0 && col < w && row >= 0 && row < h) return Math.min(maxD, dist[row * w + col] * res);
      return maxD;
    }
    function score(x, y, a, pts = points) {
      let sum = 0;
      for (const p of pts) {
        const d = distanceAt(x, y, a, p);
        sum += d * d;
      }
      return sum / pts.length;
    }
    // Deux classements des poses grossières : coût plafonné à 1,2 m (comme la V1.0) et coût plafonné à 0,5 m,
    // moins sensible aux retours d'une zone nouvelle. Les meilleures de chaque classement sont affinées;
    // ainsi la vraie pose et une pose symétrique concurrente sont toutes deux examinées par le test d'ambiguïté.
    const topFull = [],
      topCapped = [],
      coarseCap = 0.5;
    function keep(top, c, size) {
      const same = (q) => Math.hypot(q.x - c.x, q.y - c.y) < 0.55 && angleDiff(q.a, c.a) < 0.35;
      if (top.some(same)) {
        if (c.cost < top.find(same).cost) top[top.findIndex(same)] = c;
      } else top.push(c);
      top.sort((a, b) => a.cost - b.cost);
      if (top.length > size) top.length = size;
    }
    const step = Math.max(0.2, res * 4),
      angleStep = (15 * Math.PI) / 180;
    // options.around = {pose:[x,y,deg], xy, deg} : recherche LOCALE autour d'une estimation initiale
    // (fenêtre ±xy m, ±deg °, pas plus fins) au lieu de toute la carte. Sans cette option : inchangé.
    const around = options.around,
      cStep = around ? Math.max(0.05, res * 2) : step,
      lx0 = around ? around.pose[0] - around.xy : ox,
      lx1 = around ? around.pose[0] + around.xy + 1e-9 : ox + w * res,
      ly0 = around ? around.pose[1] - around.xy : oy,
      ly1 = around ? around.pose[1] + around.xy + 1e-9 : oy + h * res,
      dStep = around ? 5 : 15,
      la0 = around ? around.pose[2] - around.deg : -180,
      la1 = around ? around.pose[2] + around.deg + 1e-9 : 180 - 1e-9;
    for (let x = lx0; x <= lx1; x += cStep)
      for (let y = ly0; y <= ly1; y += cStep)
        for (let deg = la0; deg <= la1; deg += dStep) {
          const a = (deg * Math.PI) / 180;
          let full = 0,
            capped = 0;
          for (const p of points) {
            const d = distanceAt(x, y, a, p),
              dc = Math.min(coarseCap, d);
            full += d * d;
            capped += dc * dc;
          }
          keep(topFull, { x, y, a, cost: full / points.length }, 5);
          keep(topCapped, { x, y, a, cost: capped / points.length }, 5);
        }
    const top = [...topFull];
    for (const c of topCapped) if (!top.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 0.55 && angleDiff(q.a, c.a) < 0.35)) top.push(c);
    // options.seeds = [[x,y,deg], …] : poses candidates supplémentaires (ex. résultat d'une recherche locale).
    // Elles sont affinées et passent le MÊME test d'ambiguïté que les autres candidats. Sans option : inchangé.
    for (const sd of options.seeds || []) {
      const c = { x: sd[0], y: sd[1], a: (sd[2] * Math.PI) / 180 };
      if (!top.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 0.05 && angleDiff(q.a, c.a) < 0.02)) top.push(c);
    }
    if (!top.length) return { ok: false, reason: "aucun_candidat" };
    const finePoints = targetPoints.filter((_, i) => i % Math.max(1, Math.floor(targetPoints.length / 220)) === 0),
      inlierDist = Math.max(0.1, res * 2),
      cap = Math.max(0.3, res * 6);
    // coût robuste : distance plafonnée à `cap`, pour que les retours non recouverts ne dominent pas le choix
    function robust(x, y, a) {
      let sum = 0;
      for (const p of finePoints) {
        const d = Math.min(cap, distanceAt(x, y, a, p));
        sum += d * d;
      }
      return sum / finePoints.length;
    }
    let finals = [];
    for (const seed of top) {
      let best = { ...seed, cost: robust(seed.x, seed.y, seed.a) };
      for (let x = -step; x <= step + 0.001; x += Math.max(0.04, res))
        for (let y = -step; y <= step + 0.001; y += Math.max(0.04, res))
          for (let da = -angleStep; da <= angleStep + 0.001; da += (3 * Math.PI) / 180) {
            const q = { x: seed.x + x, y: seed.y + y, a: seed.a + da };
            q.cost = robust(q.x, q.y, q.a);
            if (q.cost < best.cost) best = q;
          }
      const center = { ...best };
      for (let x = -0.06; x <= 0.0601; x += Math.max(0.01, res / 2))
        for (let y = -0.06; y <= 0.0601; y += Math.max(0.01, res / 2))
          for (let da = (-3 * Math.PI) / 180; da <= (3.001 * Math.PI) / 180; da += (0.5 * Math.PI) / 180) {
            const q = { x: center.x + x, y: center.y + y, a: center.a + da };
            q.cost = robust(q.x, q.y, q.a);
            if (q.cost < best.cost) best = q;
          }
      finals.push(best);
    }
    finals.sort((a, b) => a.cost - b.cost);
    // recouvrement de chaque candidat (part des points à moins de inlierDist d'un mur de la carte)
    for (const q of finals) {
      let inliers = 0,
        inlierSq = 0;
      for (const p of finePoints) {
        const d = distanceAt(q.x, q.y, q.a, p);
        if (d <= inlierDist) {
          inliers++;
          inlierSq += d * d;
        }
      }
      q.overlap = inliers / finePoints.length;
      q.inlierRms = inliers ? Math.sqrt(inlierSq / inliers) : Infinity;
    }
    // options.freeSpaceCheck = {cells, res, maxFreeHit, maxWallCross} : test de cohérence avec l'espace libre
    // (voir freeSpaceConsistency). Sans cette option : choix et résultat inchangés.
    const fsc = options.freeSpaceCheck;
    if (fsc) for (const q of finals) Object.assign(q, freeSpaceConsistency(finePoints, [q.x, q.y, (q.a * 180) / Math.PI], fsc.cells, fsc.res));
    const choice = chooseCandidate(finals, { minOverlap, maxFreeHit: fsc ? fsc.maxFreeHit : undefined, maxWallCross: fsc ? fsc.maxWallCross : undefined });
    const best = choice.best,
      overlap = best.overlap,
      inlierRms = best.inlierRms,
      mean = Math.sqrt(score(best.x, best.y, best.a, finePoints)),
      gap = choice.gap,
      ambiguous = choice.ambiguous,
      quality = overlap >= 0.7 && gap > 0.15 ? "Bonne" : overlap >= 0.5 ? "Moyenne" : "Faible",
      pose = [best.x, best.y, (((best.a * 180) / Math.PI + 540) % 360) - 180];
    const ok = choice.ok;
    const result = { ok, reason: choice.reason, pose, mean, overlap, inlierRms, gap, ambiguous, quality, minOverlap };
    if (fsc) Object.assign(result, { freeHit: best.freeHit, wallCross: best.wallCross, incoherent: choice.incoherent });
    if (options.debug)
      result.candidates = finals.map((q) => ({ x: q.x, y: q.y, deg: (q.a * 180) / Math.PI, a: q.a, cost: q.cost, overlap: q.overlap, inlierRms: q.inlierRms, freeHit: q.freeHit, wallCross: q.wallCross }));
    return result;
  }

  /** Choix de la pose parmi les candidats affinés (triés par coût croissant), règle de locateScanOnGrid :
      meilleur candidat ; ambigu si un candidat éloigné (> 0,6 m ou > 0,4 rad) a un coût proche (écart < 8 %) ;
      accepté si non ambigu et recouvrement >= minOverlap. Avec maxFreeHit / maxWallCross, seuls les candidats
      COHÉRENTS avec l'espace libre de la carte sont considérés (pour le choix ET pour l'ambiguïté) ; s'il n'y en a
      aucun, le scan est refusé (« incohérent »). Exportée pour rejouer exactement cette règle (calibration). */
  function chooseCandidate(cands, o) {
    const check = Number.isFinite(o.maxFreeHit) || Number.isFinite(o.maxWallCross),
      pool = check ? cands.filter((q) => !(q.freeHit > o.maxFreeHit) && !(q.wallCross > o.maxWallCross)) : cands;
    if (!pool.length) return { best: cands[0], next: null, gap: 0, ambiguous: false, incoherent: true, ok: false, reason: "incoherent" };
    const best = pool[0],
      next = pool.find((q) => Math.hypot(q.x - best.x, q.y - best.y) > 0.6 || angleDiff(q.a, best.a) > 0.4),
      gap = next ? Math.max(0, (next.cost - best.cost) / Math.max(next.cost, 1e-9)) : 1,
      ambiguous = !!next && gap < 0.08,
      ok = !ambiguous && best.overlap >= o.minOverlap;
    return { best, next, gap, ambiguous, incoherent: false, ok, reason: ok ? "" : ambiguous ? "ambigu" : "recouvrement" };
  }

  // Cellules « confirmées » de la grid map log-odds : au moins deux observations nettes dans le même sens
  const FREE_CONFIRMED = -2 * FREE_STEP, // -0,8 : deux passages de rayon sans impact
    OCC_CONFIRMED = 2 * HIT_STEP; // 1,7 : deux impacts

  /** Cohérence d'une pose avec l'espace libre d'une grid map (cells = Map log-odds de computeGridCells).
      - freeHit : part des points qui tombent dans une zone confirmée LIBRE (la cellule et ses 8 voisines,
        marge d'une cellule pour le bruit) : à la bonne pose, un mur ne peut pas être là où d'autres scans ont vu du vide ;
      - wallCross : part des rayons qui TRAVERSENT une cellule confirmée OCCUPÉE avant leur impact (les 2 dernières
        cellules avant l'impact sont ignorées, marge pour le bruit) : un laser ne traverse pas un mur.
      Les cellules inconnues ou vues une seule fois ne comptent pas (porte ouverte, personne qui passe). */
  function freeSpaceConsistency(points, pose, cells, res) {
    const L = (cx, cy) => cells.get(cx + "," + cy);
    const isFree = (cx, cy) => {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const v = L(cx + dx, cy + dy);
          if (v === undefined || v > FREE_CONFIRMED) return false;
        }
      return true;
    };
    const sx0 = Math.floor(pose[0] / res),
      sy0 = Math.floor(pose[1] / res);
    let free = 0,
      cross = 0;
    for (const p of points) {
      const w = transformed(p, pose),
        x1 = Math.floor(w[0] / res),
        y1 = Math.floor(w[1] / res);
      if (isFree(x1, y1)) free++;
      // Bresenham du robot à l'impact (même tracé que computeGridCells)
      const path = [];
      let x = sx0,
        y = sy0,
        dx = Math.abs(x1 - x),
        sx = x < x1 ? 1 : -1,
        dy = -Math.abs(y1 - y),
        sy = y < y1 ? 1 : -1,
        err = dx + dy;
      while (x !== x1 || y !== y1) {
        path.push([x, y]);
        const e = 2 * err;
        if (e >= dy) {
          err += dy;
          x += sx;
        }
        if (e <= dx) {
          err += dx;
          y += sy;
        }
      }
      for (let i = 0; i < path.length - 2; i++) {
        const v = L(path[i][0], path[i][1]);
        if (v !== undefined && v >= OCC_CONFIRMED) {
          cross++;
          break;
        }
      }
    }
    const n = Math.max(1, points.length);
    return { freeHit: free / n, wallCross: cross / n };
  }

  /** Heure de capture lue dans le nom (« scan_07_19h25m53.csv ») en secondes, sinon null. */
  function captureSeconds(name) {
    const m = String(name || "").match(/(\d{1,2})h(\d{2})m(\d{2})/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
  }

  /** Paramètres de l'assemblage, fixés AVANT les essais sur les scans réels (ne pas les ajuster aux résultats). */
  const ASSEMBLY_DEFAULTS = {
    resolution: 0.05,
    minOverlap: 0.35, // même seuil par défaut que « Recouvrement min » et l'Auto-SLAM
    minPoints: 20, // en dessous : scan inexploitable (même seuil que la localisation manuelle)
    localXY: 0.3, // fenêtre locale autour de la pose du scan précédent (article RoboCup MSL : ±0,2 m / ±15°)
    localDeg: 20,
    filter: { minRange: 0.05, maxRange: 12, minIntensity: 0 },
    order: "capture", // "capture" : tri par l'heure lue dans le nom ; "fourni" : ordre donné
    // test de cohérence avec l'espace libre (freeSpaceConsistency) : {maxFreeHit, maxWallCross} ou null (désactivé)
    freeSpace: null,
  };

  /** Localisation et construction automatiques d'une carte à partir de scans enregistrés (scan matching
      successif, méthode du cours) : vérification des scans, tri dans l'ordre de capture, premier scan = origine
      (0,0,0°), puis pour chaque scan : recherche LOCALE autour de la pose du dernier scan placé, sinon recherche
      GLOBALE sur la carte cumulée (`locateScanOnGrid`, comme l'Auto-SLAM). Un scan n'est intégré que si son
      recouvrement est suffisant et sa position non ambiguë ; sinon il est mis en attente et réessayé après
      chaque nouveau placement, puis signalé. Aucun scan n'est intégré de force.
      Générateur : produit un événement par décision (pour l'affichage progressif). Les scans fournis ne sont
      jamais modifiés ; les poses sont dans les événements et dans le bilan final ({type:"fin", resultats}). */
  function* assembleSteps(inputScans, options = {}) {
    const o = { ...ASSEMBLY_DEFAULTS, ...options, filter: { ...ASSEMBLY_DEFAULTS.filter, ...(options.filter || {}) } };
    const items = inputScans.map((scan, index) => ({ scan, index, name: scan.name, t: captureSeconds(scan.name), pose: null, attempts: 0 }));
    const results = new Map();
    const record = (it, fields) => {
      const r = { nom: it.name, rang: it.index + 1, statut: "", methode: "", pose: null, recouvrement: null, ecart: null, rms_cm: null, ambigu: false, raison: "", essais: it.attempts, ...fields };
      results.set(it, r);
      return r;
    };
    // 1. vérification : format, nombre de points, doublons
    const seen = new Map(),
      valid = [];
    for (const it of items) {
      const pts = it.scan && it.scan.pts ? filterScanPoints(it.scan, o.filter) : [];
      if (!it.scan || !Array.isArray(it.scan.pts)) {
        yield { type: "invalide", ...record(it, { statut: "invalide", raison: "fichier illisible" }) };
        continue;
      }
      if (it.scan.frame === "world") {
        yield { type: "invalide", ...record(it, { statut: "invalide", raison: "coordonnées déjà en repère carte (x_m/y_m) : il faut le scan brut" }) };
        continue;
      }
      if (pts.length < o.minPoints) {
        yield { type: "invalide", ...record(it, { statut: "invalide", raison: `pas assez de points après nettoyage (${pts.length} < ${o.minPoints})` }) };
        continue;
      }
      const sig = (it.scan.rawPts || it.scan.pts).map((p) => p.r.toFixed(4)).join(";");
      if (seen.has(sig)) {
        yield { type: "doublon", ...record(it, { statut: "doublon", raison: "mêmes mesures que " + seen.get(sig).name }) };
        continue;
      }
      seen.set(sig, it);
      it.pts = pts;
      valid.push(it);
    }
    // 2. ordre de capture (heure dans le nom) si tous les scans valides en ont une
    if (o.order === "capture" && valid.length && valid.every((it) => it.t !== null)) valid.sort((a, b) => a.t - b.t || a.index - b.index);
    if (!valid.length) {
      yield { type: "fin", resultats: items.map((it) => results.get(it)), places: 0 };
      return;
    }
    // 3. origine
    const placed = [];
    const origin = valid[0];
    origin.pose = [0, 0, 0];
    placed.push(origin);
    yield { type: "origine", ...record(origin, { statut: "origine", methode: "origine", pose: [0, 0, 0], raison: "premier scan = repère (0, 0, 0°)" }) };
    // 4. scans suivants
    const tryPlace = (it) => {
      it.attempts++;
      const refs = placed.map((p) => ({ ...p.scan, pose: p.pose }));
      const cells = computeGridCells(refs, (s) => filterScanPoints(s, o.filter), o.resolution),
        g = cellsToGrid(cells, o.resolution);
      if (!g || g.occupied < 10) return { ok: false, statut: "refusé", raison: "carte précédente trop pauvre" };
      // a) recherche locale autour de la pose du dernier scan placé : donne une pose candidate ;
      // b) recherche globale sur toute la carte, avec ce candidat ajouté comme graine : la décision
      //    (recouvrement + ambiguïté) est prise sur l'ensemble des candidats, la locale ne la contourne jamais.
      const prev = placed[placed.length - 1].pose;
      const loc = locateScanOnGrid(it.pts, g, { minOverlap: o.minOverlap, around: { pose: prev, xy: o.localXY, deg: o.localDeg } });
      const fsc = o.freeSpace ? { cells, res: o.resolution, maxFreeHit: o.freeSpace.maxFreeHit, maxWallCross: o.freeSpace.maxWallCross } : undefined;
      const r = locateScanOnGrid(it.pts, g, { minOverlap: o.minOverlap, seeds: loc.pose ? [loc.pose] : [], freeSpaceCheck: fsc });
      const near = (p) => p && Math.hypot(p[0] - prev[0], p[1] - prev[1]) <= o.localXY + 0.05 && Math.abs(((p[2] - prev[2] + 540) % 360) - 180) <= o.localDeg + 1;
      const methode = near(r.pose) ? "locale" : "globale";
      const fields = { recouvrement: r.overlap, ecart: r.gap, rms_cm: Number.isFinite(r.inlierRms) ? r.inlierRms * 100 : null, ambigu: !!r.ambiguous, libre: r.freeHit ?? null, traverse: r.wallCross ?? null };
      if (!r.ok)
        return {
          ok: false,
          ...fields,
          raison: r.reason === "grille_vide" ? "carte précédente trop pauvre" : r.reason === "incoherent" ? `incohérent avec la carte : ${Math.round((r.freeHit || 0) * 100)} % de points dans du vide confirmé, ${Math.round((r.wallCross || 0) * 100)} % de rayons à travers un mur` : r.ambiguous ? "plusieurs positions possibles (ambigu)" : `trop peu de murs communs (${Math.round((r.overlap || 0) * 100)} % < ${Math.round(o.minOverlap * 100)} %)`,
        };
      return { ok: true, ...fields, methode, pose: r.pose };
    };
    const pending = [];
    function* settle(it) {
      const r = tryPlace(it);
      if (r.ok) {
        it.pose = r.pose;
        placed.push(it);
        yield { type: "place", ...record(it, { statut: "placé", methode: r.methode, pose: r.pose, recouvrement: r.recouvrement, ecart: r.ecart, rms_cm: r.rms_cm, libre: r.libre, traverse: r.traverse, essais: it.attempts }) };
        return true;
      }
      yield { type: "refuse", ...record(it, { statut: "refusé", recouvrement: r.recouvrement ?? null, ecart: r.ecart ?? null, rms_cm: r.rms_cm ?? null, ambigu: !!r.ambigu, libre: r.libre ?? null, traverse: r.traverse ?? null, raison: r.raison, essais: it.attempts }) };
      return false;
    }
    for (const it of valid.slice(1)) {
      if (yield* settle(it)) {
        // un nouveau scan agrandit la carte : on réessaie ceux en attente
        let progress = true;
        while (progress && pending.length) {
          progress = false;
          for (const w of [...pending])
            if (yield* settle(w)) {
              pending.splice(pending.indexOf(w), 1);
              progress = true;
            }
        }
      } else pending.push(it);
    }
    const res = items.map((it) => results.get(it));
    yield { type: "fin", resultats: res, places: res.filter((r) => r.statut === "placé" || r.statut === "origine").length, ordre: valid.map((it) => it.name) };
  }

  /** Version non progressive : exécute tout l'assemblage et renvoie le bilan {resultats, places, ordre}. */
  function assembleSession(scans, options = {}) {
    let last = null;
    for (const ev of assembleSteps(scans, options)) last = ev;
    return last;
  }

  return {
    assembleSteps,
    assembleSession,
    chooseCandidate,
    freeSpaceConsistency,
    captureSeconds,
    ASSEMBLY_DEFAULTS,
    parseCsv,
    parseGridCsv,
    transformed,
    filterScanPoints,
    findAnchor,
    temporalFilter,
    computeGridCells,
    cellState,
    cellsToGrid,
    gridToCsv,
    gridToMapToolCsv,
    locateScanOnGrid,
  };
});
