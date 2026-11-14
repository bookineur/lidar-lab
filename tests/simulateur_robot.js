"use strict";
// Robot SIMULÉ pour tester l'exploration automatique (ce n'est pas le vrai robot) :
// - le robot bouge selon /turn (deg > 0 = à gauche) et /drive (l, r en %), avec des erreurs aléatoires
//   (rotation ±5 %, distance ±10 %) comme un vrai robot sans odométrie ;
// - il s'arrête seul sans ordre pendant 0,7 s (comme le sketch) ;
// - une collision avec un mur est détectée (rayon du robot 12 cm) ;
// - capture + recalage avec la MÊME règle que l'Auto-SLAM du serveur (locateScanOnGrid, recouvrement 35 %).
// Temps virtuel : sleep() fait avancer l'horloge sans attendre, le test est rapide et reproductible.
const LC = require("../lidar_core.js");
const S = require("./synthetic_ld06.js");

function createSimRobot({ walls, start, seed = 1, speedPerPct = 0.0075, radius = 0.12 }) {
  const rng = S.mulberry32(seed);
  const gauss = () => {
    const u = Math.max(1e-9, rng()),
      v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  // extraWalls : obstacles ajoutés en cours de test (ex. un carton posé devant le robot), absents de la carte
  const st = { pose: [...start], now: 0, cmd: { l: 0, r: 0, at: -1e9 }, collided: false, travelled: 0, scans: 0, log: [], extraWalls: [] };
  const allWalls = () => walls.concat(st.extraWalls || []);
  const filter = { minRange: 0.05, maxRange: 12, minIntensity: 0 };
  const map = []; // scans recalés {pts, pose, truth}

  function nearestWall(x, y) {
    let best = Infinity;
    for (const w of allWalls()) {
      const ax = w.a[0], ay = w.a[1], bx = w.b[0], by = w.b[1];
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-12;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
      best = Math.min(best, Math.hypot(x - ax - t * vx, y - ay - t * vy));
    }
    return best;
  }
  function advance(ms) {
    // intégration par pas de 20 ms
    for (let t = 0; t < ms; t += 20) {
      st.now += 20;
      const alive = st.now - st.cmd.at <= 700;
      const l = alive ? st.cmd.l : 0, r = alive ? st.cmd.r : 0;
      if (!l && !r) continue;
      const v = ((l + r) / 2) * speedPerPct * st.cmd.gain; // m/s
      const nx = st.pose[0] + v * 0.02 * Math.cos((st.pose[2] * Math.PI) / 180),
        ny = st.pose[1] + v * 0.02 * Math.sin((st.pose[2] * Math.PI) / 180);
      if (nearestWall(nx, ny) < radius) {
        st.collided = true;
        st.cmd = { l: 0, r: 0, at: -1e9, gain: 1 };
        return;
      }
      st.travelled += Math.hypot(nx - st.pose[0], ny - st.pose[1]);
      st.pose[0] = nx;
      st.pose[1] = ny;
    }
  }
  function scanNow() {
    st.scans++;
    const pts = S.simulateScan({ pose: st.pose, walls: allWalls(), seed: seed * 1000 + st.scans });
    return LC.parseCsv(S.toCsv(pts), "sim");
  }
  const io = {
    now: () => st.now,
    sleep: async (ms) => advance(ms),
    scan: async () => scanNow(),
    stop: async () => {
      st.cmd = { l: 0, r: 0, at: -1e9, gain: 1 };
    },
    drive: async (l, r) => {
      if (st.cmd.l !== l || st.cmd.r !== r || st.now - st.cmd.at > 700) st.cmd = { l, r, at: st.now, gain: 1 + 0.1 * gauss() };
      else st.cmd.at = st.now;
    },
    turn: async (deg) => {
      const real = deg * (1 + 0.05 * gauss());
      st.pose[2] = ((st.pose[2] + real + 540) % 360) - 180; // rotation sur place (pas de déplacement)
      st.log.push(`turn ${deg} -> ${real.toFixed(1)}`);
      return Math.round(Math.abs(deg) * 11);
    },
    capture: async () => {
      const sc = scanNow();
      const pts = LC.filterScanPoints(sc, filter);
      const truth = [...st.pose];
      if (!map.length) {
        map.push({ ...sc, pose: [0, 0, 0], truth });
        return { ok: true, pose: [0, 0, 0] };
      }
      const g = LC.cellsToGrid(LC.computeGridCells(map, (s) => LC.filterScanPoints(s, filter), 0.05), 0.05);
      const r = LC.locateScanOnGrid(pts, g, { minOverlap: 0.35 });
      if (!r.ok) return { ok: false };
      map.push({ ...sc, pose: r.pose, truth });
      return { ok: true, pose: r.pose };
    },
    state: () => {
      if (!map.length) return { pose: null, grid: null, visited: [] };
      const g = LC.cellsToGrid(LC.computeGridCells(map, (s) => LC.filterScanPoints(s, filter), 0.05), 0.05);
      return { pose: map[map.length - 1].pose, grid: g, visited: map.map((m) => m.pose) };
    },
  };
  return { io, st, map, filter };
}

module.exports = { createSimRobot };
