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
    for (let x = ox; x <= ox + w * res; x += step)
      for (let y = oy; y <= oy + h * res; y += step)
        for (let deg = -180; deg < 180; deg += 15) {
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
    const best = finals[0],
      next = finals.find((q) => Math.hypot(q.x - best.x, q.y - best.y) > 0.6 || angleDiff(q.a, best.a) > 0.4);
    let inliers = 0,
      inlierSq = 0;
    for (const p of finePoints) {
      const d = distanceAt(best.x, best.y, best.a, p);
      if (d <= inlierDist) {
        inliers++;
        inlierSq += d * d;
      }
    }
    const overlap = inliers / finePoints.length,
      inlierRms = inliers ? Math.sqrt(inlierSq / inliers) : Infinity,
      mean = Math.sqrt(score(best.x, best.y, best.a, finePoints)),
      gap = next ? Math.max(0, (next.cost - best.cost) / Math.max(next.cost, 1e-9)) : 1,
      ambiguous = !!next && gap < 0.08,
      quality = overlap >= 0.7 && gap > 0.15 ? "Bonne" : overlap >= 0.5 ? "Moyenne" : "Faible",
      pose = [best.x, best.y, (((best.a * 180) / Math.PI + 540) % 360) - 180];
    const ok = !ambiguous && overlap >= minOverlap;
    const result = { ok, reason: ok ? "" : ambiguous ? "ambigu" : "recouvrement", pose, mean, overlap, inlierRms, gap, ambiguous, quality, minOverlap };
    if (options.debug) result.candidates = finals.map((q) => ({ x: q.x, y: q.y, deg: (q.a * 180) / Math.PI, cost: q.cost }));
    return result;
  }

  return {
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
