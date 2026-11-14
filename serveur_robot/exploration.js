"use strict";
// ============================================================================
//  Exploration automatique (bonus du TP) : le robot choisit lui-même où aller pour construire la carte.
//
//  Cycle « regarder → choisir → pivoter → avancer d'un pas → s'arrêter → capturer et recaler » :
//    1. le dernier scan donne, pour 12 directions (tous les 30°), la distance libre dans un couloir
//       de la largeur du robot ;
//    2. parmi les directions assez dégagées, on choisit celle qui pointe vers le plus de FRONTIÈRES de la
//       carte (cellules inconnues voisines d'une cellule libre), les proches comptant plus ;
//    3. le robot pivote (/turn) ; robot arrêté, il vérifie que l'avant est dégagé sur la longueur du pas plus la
//       distance de sécurité, puis avance d'un petit pas (/drive renvoyé toutes les 250 ms) et s'arrête ;
//    4. capture + recalage (Auto-SLAM existant) : la pose vient du LiDAR, pas d'une odométrie.
//  Arrêts : plus de frontière accessible, nombre de pas ou durée maximum, 2 recalages refusés de suite
//  (position perdue), ou demande d'arrêt. Le robot reçoit /stop à la fin, quelle qu'en soit la raison.
//
//  Ce module ne parle pas directement au robot : il reçoit des fonctions (io), ce qui permet de le tester
//  en simulation avec exactement la même logique que sur le vrai robot.
// ============================================================================

const DEFAULTS = {
  sectors: 12, // directions testées (tous les 30°)
  halfWidth: 0.2, // demi-largeur du couloir de passage (robot + marge), m
  minClear: 0.75, // distance libre minimale pour envisager une direction, m
  safety: 0.35, // arrêt immédiat si un obstacle est plus près que ça devant, m
  step: 0.35, // longueur visée d'un pas, m
  speed: 35, // consigne de vitesse en % pendant un pas
  speedEst: 0.25, // vitesse estimée à cette consigne, m/s (à étalonner sur le vrai robot)
  coneDeg: 20, // une frontière compte pour une direction si elle est dans ce cône (±), °
  frontierRange: 8, // distance maximale des frontières prises en compte, m
  minFrontier: 3, // score minimal (somme de 1/(1+distance)) pour qu'une direction vaille le déplacement
  inflate: 0.25, // marge autour des murs pour la planification de chemin, m
  waypoint: 1.0, // le robot vise le point du chemin situé à cette distance, m
  visitedRadius: 0.5, // une cible à moins de ça d'une pose déjà visitée est pénalisée
  maxSteps: 60,
  maxMs: 15 * 60 * 1000,
  maxRefused: 2,
  rangeMin: 0.1,
  rangeMax: 8,
};

const rad = (d) => (d * Math.PI) / 180;
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Distance libre devant le robot dans la direction `deg` (repère du robot), dans un couloir de demi-largeur w. */
function corridorClearance(points, deg, w) {
  const c = Math.cos(rad(deg)),
    s = Math.sin(rad(deg));
  let best = Infinity;
  for (const p of points) {
    const fwd = p.x * c + p.y * s,
      lat = -p.x * s + p.y * c;
    if (fwd > 0 && Math.abs(lat) <= w && fwd < best) best = fwd;
  }
  return best;
}

/** Cellule de grille (rows du haut vers le bas, origin = coin bas-gauche) : -1 inconnu, 0 libre, 1 occupé. */
function cellAt(grid, x, y) {
  const col = Math.floor((x - grid.origin[0]) / grid.resolution),
    iy = Math.floor((y - grid.origin[1]) / grid.resolution),
    row = grid.height - 1 - iy;
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return -1;
  return grid.rows[row][col];
}

/** Cellules FRONTIÈRES de la carte : inconnues avec au moins un voisin libre (centres en coordonnées carte). */
function frontierCells(grid) {
  if (!grid) return [];
  const out = [],
    { rows, width, height, resolution: r, origin } = grid;
  const at = (row, col) => (row < 0 || row >= height || col < 0 || col >= width ? -1 : rows[row][col]);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      if (rows[row][col] !== -1) continue;
      if (at(row - 1, col) === 0 || at(row + 1, col) === 0 || at(row, col - 1) === 0 || at(row, col + 1) === 0)
        out.push([origin[0] + (col + 0.5) * r, origin[1] + (height - 1 - row + 0.5) * r]);
    }
  return out;
}

/** Chemin le plus court (parcours en largeur, 8 voisins) depuis la pose jusqu'à la frontière ATTEIGNABLE la plus
    proche, sur les cellules libres de la carte éloignées des murs d'au moins `inflate`. Renvoie le point du chemin
    situé à environ `waypoint` m (coordonnées carte) et la longueur du chemin, ou null s'il n'y a plus de frontière
    atteignable. (Exploration par frontières, Yamauchi 1997.) */
function planToFrontier(grid, pose, o) {
  if (!grid) return null;
  const { rows, width: W, height: H, resolution: r, origin } = grid;
  const at = (row, col) => (row < 0 || row >= H || col < 0 || col >= W ? -1 : rows[row][col]);
  const k = Math.ceil(o.inflate / r);
  // cellules trop proches d'un mur (occupé) : interdites
  const blocked = new Uint8Array(W * H);
  for (let row = 0; row < H; row++)
    for (let col = 0; col < W; col++)
      if (rows[row][col] === 1)
        for (let dr = -k; dr <= k; dr++)
          for (let dc = -k; dc <= k; dc++) {
            const rr = row + dr, cc = col + dc;
            if (rr >= 0 && rr < H && cc >= 0 && cc < W && dr * dr + dc * dc <= k * k) blocked[rr * W + cc] = 1;
          }
  const isFrontier = (row, col) => {
    if (at(row, col) !== 0) return false; // cellule LIBRE au bord de l'inconnu (2 voisins inconnus : pas un simple trou de bruit)
    let unk = 0;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(row + dr, col + dc) === -1) unk++;
    return unk >= 2;
  };
  const sc = Math.floor((pose[0] - origin[0]) / r),
    sr = H - 1 - Math.floor((pose[1] - origin[1]) / r);
  if (sc < 0 || sc >= W || sr < 0 || sr >= H) return null;
  const prev = new Int32Array(W * H).fill(-1),
    start = sr * W + sc;
  prev[start] = start;
  const queue = [start];
  let goal = -1;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi],
      row = Math.floor(cur / W),
      col = cur % W;
    if (cur !== start && isFrontier(row, col) && Math.hypot((row - sr) * r, (col - sc) * r) > 0.4) {
      goal = cur;
      break;
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const rr = row + dr, cc = col + dc;
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) continue;
      const n = rr * W + cc;
      if (prev[n] !== -1 || at(rr, cc) !== 0 || (blocked[n] && cur !== start && !blocked[cur])) continue;
      if (blocked[n] && !blocked[start]) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (goal < 0) return null;
  const path = [];
  for (let c = goal; c !== start; c = prev[c]) path.push(c);
  path.reverse();
  const toXY = (c) => [origin[0] + ((c % W) + 0.5) * r, origin[1] + (H - 1 - Math.floor(c / W) + 0.5) * r];
  let wp = toXY(path[path.length - 1]);
  for (const c of path) {
    const p = toXY(c);
    if (Math.hypot(p[0] - pose[0], p[1] - pose[1]) >= o.waypoint) {
      wp = p;
      break;
    }
  }
  return { waypoint: wp, length: path.length * r };
}

/** Choix de la prochaine direction. points : scan courant (repère robot) ; pose [x,y,deg] ; grid : carte cumulée ;
    visited : poses déjà occupées. Renvoie {turnDeg, clearance, step, score, sectors} ou null (rien à explorer). */
function chooseDirection(points, pose, grid, visited, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const sectors = [];
  let best = null;
  // 1) chemin vers la frontière atteignable la plus proche ; on vise le premier point du chemin
  const plan = planToFrontier(grid, pose, o);
  if (plan) {
    const dx = plan.waypoint[0] - pose[0],
      dy = plan.waypoint[1] - pose[1],
      dist = Math.hypot(dx, dy),
      deg = wrapDeg((Math.atan2(dy, dx) * 180) / Math.PI - pose[2]),
      clearance = corridorClearance(points, deg, o.halfWidth),
      step = Math.max(0, Math.min(o.step, dist, clearance - o.safety - 0.1));
    if (step >= 0.1) return { turnDeg: Math.round(deg), clearance, step, score: plan.length, mode: "chemin", sectors };
    // direction du chemin bouchée de près (angle de mur…) : direction dégagée la plus proche de celle du chemin
    let around = null;
    for (let k = 0; k < o.sectors; k++) {
      const d2 = wrapDeg((k * 360) / o.sectors),
        c2 = corridorClearance(points, d2, o.halfWidth);
      if (c2 < o.minClear) continue;
      const diff = Math.abs(wrapDeg(d2 - deg));
      if (!around || diff < around.diff) around = { diff, turnDeg: d2, clearance: c2 };
    }
    if (around && around.diff <= 120)
      return { turnDeg: around.turnDeg, clearance: around.clearance, step: Math.max(0.1, Math.min(o.step, around.clearance - o.safety - 0.1)), score: plan.length, mode: "contournement", sectors };
  }
  // 2) secours : direction dégagée qui pointe vers le plus de frontières
  const frontier = frontierCells(grid);
  for (let k = 0; k < o.sectors; k++) {
    const deg = wrapDeg((k * 360) / o.sectors);
    const clearance = corridorClearance(points, deg, o.halfWidth);
    const sec = { deg, clearance, score: 0, ok: clearance >= o.minClear };
    sectors.push(sec);
    if (!sec.ok) continue;
    // intérêt de la direction : frontières de TOUTE la carte situées dans son cône, les proches comptant plus
    const heading = pose[2] + deg;
    let score = 0;
    for (const [fx, fy] of frontier) {
      const d = Math.hypot(fx - pose[0], fy - pose[1]);
      if (d > o.frontierRange || d < 0.2) continue;
      const bearing = (Math.atan2(fy - pose[1], fx - pose[0]) * 180) / Math.PI;
      if (Math.abs(wrapDeg(bearing - heading)) <= o.coneDeg) score += 1 / (1 + d);
    }
    const stepLen = Math.max(0, Math.min(o.step, clearance - o.safety - 0.1)),
      tx = pose[0] + stepLen * Math.cos(rad(heading)),
      ty = pose[1] + stepLen * Math.sin(rad(heading));
    if (visited.some((v) => Math.hypot(v[0] - tx, v[1] - ty) < o.visitedRadius * 0.6)) score *= 0.6;
    score -= Math.abs(deg) / 60; // à égalité, préférer tourner peu
    sec.score = score;
    if (score >= o.minFrontier && (!best || score > best.score))
      best = { turnDeg: deg, clearance, step: Math.max(0, Math.min(o.step, clearance - o.safety - 0.1)), score, mode: "direction" };
  }
  if (!plan) return null; // plus aucune frontière atteignable : exploration terminée
  return best ? { ...best, sectors } : null;
}

/** Points cartésiens d'un scan (lidar_core.parseCsv) filtrés en portée. */
function localPoints(scan, o) {
  return (scan.pts || []).filter((p) => p.r >= o.rangeMin && p.r <= o.rangeMax);
}

/** Explorateur. io = {
      scan(): Promise<{pts}> (scan frais, repère robot ; jamais appelé pendant que le robot roule),
      turn(deg): Promise<number ms>, drive(l, r): Promise, stop(): Promise,
      capture(): Promise<{ok, pose}> (capture + recalage ; pose [x,y,deg] si ok),
      state(): {pose, grid, visited} (dernière pose recalée, carte cumulée, poses visitées),
      sleep(ms), now() }  */
function createExplorer(io, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const st = { running: false, stopRequested: false, step: 0, refused: 0, status: "à l’arrêt", log: [], lastChoice: null, startedAt: 0 };
  const log = (m) => {
    st.log.push(m);
    if (st.log.length > 200) st.log.shift();
    st.status = m;
  };

  // Après chaque ordre de mouvement : si STOP est arrivé pendant l'envoi, on renvoie /stop (le robot traite
  // les requêtes une par une : un /turn parti juste avant le STOP ne doit pas être exécuté après lui).
  async function move(fn) {
    const r = await fn();
    if (st.stopRequested) await io.stop();
    return r;
  }

  // Un pas : contrôle de l'avant ROBOT À L'ARRÊT, puis /drive renvoyé toutes les 250 ms pendant la durée du pas.
  // Aucun scan n'est lu PENDANT le pas : le robot ne traite qu'une requête à la fois et un /scan peut mettre 1 à 3 s
  // par un partage de connexion ; les /drive suivants attendraient derrière lui (à-coups : la sécurité de 0,7 s du
  // robot l'arrête) et la mesure de l'avant daterait de plusieurs secondes. Le pas est court (≤ 0,35 m, ~1,4 s) et
  // limité par le dégagement mesuré juste avant (pas ≤ dégagement − sécurité − 0,1 m).
  async function stepForward(dist) {
    const front = corridorClearance(localPoints(await io.scan(), o), 0, o.halfWidth);
    if (front < o.safety + dist) return { blocked: true, ms: 0 };
    const t0 = io.now(),
      dur = (dist / o.speedEst) * 1000;
    while (!st.stopRequested && io.now() - t0 < dur) {
      await move(() => io.drive(o.speed, o.speed));
      await io.sleep(250);
    }
    await io.stop();
    return { blocked: false, ms: io.now() - t0 };
  }

  async function run() {
    st.running = true;
    st.stopRequested = false;
    st.step = 0;
    st.refused = 0;
    st.startedAt = io.now();
    let reason = "";
    try {
      await io.stop();
      if (!io.state().pose) {
        log("Premier scan : origine de la carte");
        const r = await io.capture();
        if (!r.ok) return (reason = "arrêt : le premier scan n’a pas pu être enregistré");
      }
      while (true) {
        if (st.stopRequested) return (reason = "arrêt demandé");
        if (st.step >= o.maxSteps) return (reason = `terminé : ${o.maxSteps} pas`);
        if (io.now() - st.startedAt > o.maxMs) return (reason = "terminé : durée maximum");
        const { pose, grid, visited } = io.state();
        const sc = await io.scan();
        const choice = chooseDirection(localPoints(sc, o), pose, grid, visited, o);
        st.lastChoice = choice && { turnDeg: choice.turnDeg, clearance: choice.clearance, score: choice.score };
        if (!choice) return (reason = "terminé : plus de zone inconnue accessible");
        if (Math.abs(choice.turnDeg) >= 3) {
          log(`Pas ${st.step + 1} : rotation de ${choice.turnDeg}°`);
          const ms = await move(() => io.turn(choice.turnDeg));
          await io.sleep((+ms || 0) + 500);
          if (st.stopRequested) return (reason = "arrêt demandé");
        }
        log(`Pas ${st.step + 1} : avance de ${(choice.step * 100).toFixed(0)} cm (libre ${choice.clearance.toFixed(2)} m)`);
        const mv = await stepForward(choice.step);
        if (st.stopRequested) return (reason = "arrêt demandé");
        await io.sleep(300);
        const r = await io.capture();
        st.step++;
        if (r.ok) {
          st.refused = 0;
          log(`Pas ${st.step} : recalé en ${r.pose.map((v) => v.toFixed(2)).join(", ")}${mv.blocked ? " (arrêté par un obstacle)" : ""}`);
        } else {
          st.refused++;
          log(`Pas ${st.step} : recalage refusé (${st.refused}/${o.maxRefused})`);
          if (st.refused >= o.maxRefused) return (reason = "arrêt : position perdue (recalages refusés)");
        }
      }
    } catch (e) {
      reason = "arrêt sur erreur : " + (e && e.message ? e.message : String(e));
    } finally {
      try {
        await io.stop();
      } catch {}
      st.running = false;
      log(reason || "arrêt");
    }
  }

  return {
    start() {
      if (st.running) return false;
      st.promise = run();
      return true;
    },
    stop() {
      st.stopRequested = true;
      return io.stop().catch(() => {});
    },
    status: () => ({ running: st.running, step: st.step, refused: st.refused, status: st.status, lastChoice: st.lastChoice, log: st.log.slice(-20) }),
    wait: () => st.promise,
  };
}

module.exports = { DEFAULTS, corridorClearance, frontierCells, planToFrontier, chooseDirection, createExplorer };
