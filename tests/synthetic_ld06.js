"use strict";
// SIMULATION LOGICIELLE — générateur de scans LD06 synthétiques.
// Ces données ne sont PAS des mesures du robot : elles sont calculées par lancer de rayons
// sur une géométrie inventée, avec un bruit pseudo-aléatoire à graine fixe (reproductible).
// Convention LD06 : angles en degrés, sens trigonométrique, 0° = axe x du robot.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Rectangle fermé (4 segments). */
function rect(x0, y0, x1, y1, label = "mur") {
  return [
    { a: [x0, y0], b: [x1, y0], label },
    { a: [x1, y0], b: [x1, y1], label },
    { a: [x1, y1], b: [x0, y1], label },
    { a: [x0, y1], b: [x0, y0], label },
  ];
}
function seg(x0, y0, x1, y1, label = "mur") {
  return { a: [x0, y0], b: [x1, y1], label };
}

function raySegment(ox, oy, dx, dy, s) {
  const ex = s.b[0] - s.a[0],
    ey = s.b[1] - s.a[1],
    den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const wx = s.a[0] - ox,
    wy = s.a[1] - oy,
    t = (wx * ey - wy * ex) / den,
    u = (wx * dy - wy * dx) / den;
  return t > 1e-9 && u >= 0 && u <= 1 ? t : Infinity;
}
function rayCircle(ox, oy, dx, dy, c) {
  const fx = ox - c.x,
    fy = oy - c.y,
    b = fx * dx + fy * dy,
    cc = fx * fx + fy * fy - c.r * c.r,
    disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 1e-9 ? t : Infinity;
}

/**
 * Simule un tour LD06.
 * @param {object} o
 * @param {number[]} o.pose  pose vraie du robot dans le monde [x_m, y_m, theta_deg]
 * @param {object[]} o.walls segments {a,b,label}
 * @param {object[]} [o.circles] obstacles ronds {x,y,r,label,intensity}
 * @param {number} [o.n] nombre de rayons par tour (LD06 ≈ 450 à 10 Hz)
 * @param {number} [o.noise] écart-type du bruit de distance (m)
 * @param {number} [o.seed]
 * @param {object[]} [o.extras] retours ajoutés {angle, distance, intensity, label} (repère robot)
 * @returns {{angle:number, distance:number, intensity:number, label:string}[]}
 */
function simulateScan(o) {
  const rng = mulberry32(o.seed ?? 1),
    n = o.n ?? 450,
    noise = o.noise ?? 0.008,
    [px, py, pth] = o.pose,
    out = [];
  for (let k = 0; k < n; k++) {
    const angle = +((k * 360) / n).toFixed(2),
      w = ((pth + angle) * Math.PI) / 180,
      dx = Math.cos(w),
      dy = Math.sin(w);
    let best = Infinity,
      hit = null;
    for (const s of o.walls) {
      const t = raySegment(px, py, dx, dy, s);
      if (t < best) {
        best = t;
        hit = { label: s.label, intensity: s.intensity };
      }
    }
    for (const c of o.circles || []) {
      const t = rayCircle(px, py, dx, dy, c);
      if (t < best) {
        best = t;
        hit = { label: c.label || "obstacle", intensity: c.intensity };
      }
    }
    if (!hit) continue; // pas de retour (aucune surface)
    const distance = best + noise * gauss(rng),
      base = hit.intensity ?? Math.max(60, 230 - 9 * best),
      intensity = Math.max(0, Math.min(255, Math.round(base + 6 * gauss(rng))));
    out.push({ angle, distance, intensity, label: hit.label });
  }
  for (const e of o.extras || []) out.push({ label: "extra", ...e });
  out.sort((p, q) => p.angle - q.angle);
  return out;
}

const SIM_HEADER = "# SIMULATION logicielle (scan LD06 synthétique) — ce n'est pas une mesure réelle du robot";

/** Formats CSV acceptés par la V1. */
function toCsv(points, format = "ld06_mm") {
  const lines = [SIM_HEADER];
  if (format === "ld06_mm") {
    lines.push("angle_deg,distance_mm,intensity");
    for (const p of points) lines.push(`${p.angle.toFixed(2)},${Math.round(p.distance * 1000)},${p.intensity}`);
  } else if (format === "m_sans_intensite") {
    // ex. export Teleplot : angle + distance en mètres, aucune intensité
    lines.push("angle_deg,distance_m");
    for (const p of points) lines.push(`${p.angle.toFixed(2)},${p.distance.toFixed(4)}`);
  } else if (format === "maptool") {
    lines.push("angle_deg,r_m,x_rel_m,y_rel_m");
    for (const p of points) {
      const a = (p.angle * Math.PI) / 180;
      lines.push(`${p.angle.toFixed(2)},${p.distance.toFixed(4)},${(p.distance * Math.cos(a)).toFixed(4)},${(p.distance * Math.sin(a)).toFixed(4)}`);
    }
  } else if (format === "printScanCSV") {
    // sortie série du sketch LD06_capture (ld06.printScanCSV) : en-tête, une ligne par point, puis ligne vide ; fins de ligne CRLF
    const rows = ["N,Angle,Distance,Intensity,x,y"];
    points.forEach((p, i) => {
      const a = (p.angle * Math.PI) / 180,
        mm = Math.round(p.distance * 1000);
      rows.push(`${i},${p.angle.toFixed(2)},${mm},${p.intensity},${Math.round(mm * Math.cos(a))},${Math.round(mm * Math.sin(a))}`);
    });
    return rows.join("\r\n") + "\r\n\r\n";
  } else throw new Error("format inconnu " + format);
  return lines.join("\n") + "\n";
}

/** Indices des points conservés par parseCsv (0.05 < r < 15 m) pour relier chaque point parsé à son étiquette. */
function parsedLabels(points) {
  return points.filter((p) => {
    const r = Math.round(p.distance * 1000) * 0.001;
    return r > 0.05 && r < 15;
  });
}

/** Pose relative de b dans le repère de a (a, b en [x, y, deg]). */
function relativePose(a, b) {
  const t = (a[2] * Math.PI) / 180,
    dx = b[0] - a[0],
    dy = b[1] - a[1];
  return [Math.cos(t) * dx + Math.sin(t) * dy, -Math.sin(t) * dx + Math.cos(t) * dy, ((((b[2] - a[2] + 180) % 360) + 360) % 360) - 180];
}

module.exports = { mulberry32, rect, seg, simulateScan, toCsv, parsedLabels, relativePose, SIM_HEADER };
