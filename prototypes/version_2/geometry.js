/* Opérations 2D du TP: segmentation Split-and-Merge et géométrie des segments.
   Unités: coordonnées et tolérances de position en mètres; angles en degrés. */
(function (root) {
  'use strict';
  const TOL = 1e-6;             // tolérance de position du TP: 1 micromètre
  const PARALLEL_EPS = 1e-9;    // seuil sans dimension pour les droites parallèles
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const norm = a => Math.hypot(a[0], a[1]);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const segLength = s => norm(sub(s[1], s[0]));

  function angleDeg(a, b) {
    const u = sub(a[1], a[0]), v = sub(b[1], b[0]);
    const lu = norm(u), lv = norm(v);
    if (lu <= TOL || lv <= TOL) return null;
    const oriented = Math.atan2(cross(u, v), dot(u, v));
    const folded = Math.abs(oriented) % Math.PI;
    return Math.min(folded, Math.PI - folded) * 180 / Math.PI;
  }

  function pointSegmentDistance(p, s) {
    const v = sub(s[1], s[0]), vv = dot(v, v);
    if (vv <= TOL * TOL) return norm(sub(p, s[0]));
    return norm(sub(p, add(s[0], mul(v, clamp(dot(sub(p, s[0]), v) / vv, 0, 1)))));
  }

  function lineDistance(p, s) {
    const v = sub(s[1], s[0]), l = norm(v);
    return l <= TOL ? norm(sub(p, s[0])) : Math.abs(cross(mul(v, 1 / l), sub(p, s[0])));
  }

  function intersection(a, b, tol = TOL) {
    const p = a[0], r = sub(a[1], a[0]), q = b[0], s = sub(b[1], b[0]);
    const lr = norm(r), ls = norm(s);
    if (lr <= tol || ls <= tol) return null;
    const den = cross(r, s);
    if (Math.abs(den) <= PARALLEL_EPS * lr * ls) return null;
    const qp = sub(q, p), t = cross(qp, s) / den, u = cross(qp, r) / den;
    // Le point doit appartenir aux deux segments; les extrémités sont incluses.
    if (t < -tol / lr || t > 1 + tol / lr || u < -tol / ls || u > 1 + tol / ls) return null;
    return { point: add(p, mul(r, t)), t, u };
  }

  function cut(target, cutter, tol = TOL) {
    const hit = intersection(target, cutter, tol);
    if (!hit) return { segment: target, changed: false, point: null };
    const d1 = norm(sub(hit.point, target[0])), d2 = norm(sub(hit.point, target[1]));
    if (d1 <= tol || d2 <= tol) return { segment: target, changed: false, point: hit.point };
    // Côté le plus long; à égalité à la tolérance près, conserver target[0].
    const kept = d2 > d1 + tol ? [hit.point, target[1]] : [target[0], hit.point];
    return { segment: kept, changed: true, point: hit.point };
  }

  function proximity(a, b, angleToleranceDeg = 8, lineToleranceM = 0.05, gapToleranceM = 0.10) {
    const angle = angleDeg(a, b);
    if (angle === null) return { angle, lineGap: Infinity, alongGap: Infinity, near: false };
    const ref = segLength(a) >= segLength(b) ? a : b;
    const other = ref === a ? b : a;
    const lineGap = Math.max(lineDistance(other[0], ref), lineDistance(other[1], ref));
    const d = mul(sub(ref[1], ref[0]), 1 / segLength(ref));
    const L = segLength(ref), t = other.map(p => dot(sub(p, ref[0]), d)).sort((x, y) => x - y);
    const alongGap = Math.max(0, t[0] - L, -t[1]);
    return { angle, lineGap, alongGap,
      near: angle <= angleToleranceDeg && lineGap <= lineToleranceM && alongGap <= gapToleranceM };
  }

  function merge(a, b) {
    const l1 = segLength(a), l2 = segLength(b);
    const d1 = mul(sub(a[1], a[0]), 1 / l1);
    let d2 = mul(sub(b[1], b[0]), 1 / l2);
    if (dot(d1, d2) < 0) d2 = mul(d2, -1);
    let d = add(mul(d1, l1), mul(d2, l2));
    d = norm(d) > TOL ? mul(d, 1 / norm(d)) : d1;
    const c1 = mul(add(a[0], a[1]), 0.5), c2 = mul(add(b[0], b[1]), 0.5);
    const c = mul(add(mul(c1, l1), mul(c2, l2)), 1 / (l1 + l2));
    const t = [a[0], a[1], b[0], b[1]].map(p => dot(sub(p, c), d));
    return [add(c, mul(d, Math.min(...t))), add(c, mul(d, Math.max(...t)))];
  }

  function fitLine(points) {
    const c = points.reduce((v, p) => add(v, p), [0, 0]).map(v => v / points.length);
    let xx = 0, xy = 0, yy = 0;
    for (const p of points) { const x = p[0] - c[0], y = p[1] - c[1]; xx += x*x; xy += x*y; yy += y*y; }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy), d = [Math.cos(angle), Math.sin(angle)];
    return [add(c, mul(d, dot(sub(points[0], c), d))), add(c, mul(d, dot(sub(points[points.length - 1], c), d)))];
  }

  function maxResidual(points, seg) {
    const v = sub(seg[1], seg[0]), l = norm(v);
    if (l <= TOL) return Math.max(...points.map(p => norm(sub(p, seg[0]))));
    const d = mul(v, 1 / l);
    return Math.max(...points.map(p => Math.abs(cross(d, sub(p, seg[0])))));
  }

  function splitRange(points, i, j, threshold, out) {
    if (j - i < 2) { out.push([i, j]); return; }
    const a = points[i], b = points[j], ab = sub(b, a), l = norm(ab);
    let max = -1, k = -1;
    for (let n = i + 1; n < j; n++) {
      const rel = sub(points[n], a), d = l < 1e-12 ? norm(rel) : Math.abs(cross(ab, rel)) / l;
      if (d > max) { max = d; k = n; }
    }
    if (max > threshold) { splitRange(points, i, k, threshold, out); splitRange(points, k, j, threshold, out); }
    else out.push([i, j]);
  }

  function splitMergeRanges(points, threshold) {
    const pieces = [];
    splitRange(points, 0, points.length - 1, threshold, pieces);
    const merged = [];
    for (const [i, j] of pieces) {
      if (merged.length) {
        const start = merged[merged.length - 1][0], candidate = points.slice(start, j + 1);
        if (maxResidual(candidate, fitLine(candidate)) <= threshold) { merged[merged.length - 1] = [start, j]; continue; }
      }
      merged.push([i, j]);
    }
    return merged;
  }

  function splitClusters(points, gap) {
    const n = points.length;
    if (!n) return [];
    if (n === 1) return [[points[0]]];
    const jumps = points.map((p, i) => norm(sub(points[(i + 1) % n], p)));
    const start = (jumps.indexOf(Math.max(...jumps)) + 1) % n;
    const ordered = Array.from({ length: n }, (_, i) => points[(start + i) % n]);
    const clusters = []; let current = [ordered[0]];
    for (let i = 1; i < n; i++) {
      if (norm(sub(ordered[i], ordered[i - 1])) > gap) { if (current.length) clusters.push(current); current = []; }
      current.push(ordered[i]);
    }
    if (current.length) clusters.push(current);
    return clusters;
  }

  function extractSegments(points, { gap = 0.20, splitThreshold = 0.10, minPoints = 6, minLength = 0.15 } = {}) {
    const segments = [], clusters = splitClusters(points, gap);
    for (let cluster of clusters) {
      if (cluster.length < minPoints) continue;
      let ranges = splitMergeRanges(cluster, splitThreshold);
      // Si la pièce forme un contour fermé, le départ arbitraire peut couper un mur.
      if (clusters.length === 1 && ranges.length > 1) {
        const cutAt = ranges[0][1];
        cluster = Array.from({ length: cluster.length }, (_, i) => cluster[(i + cutAt) % cluster.length]);
        ranges = splitMergeRanges(cluster, splitThreshold);
      }
      for (const [i, j] of ranges) {
        if (j - i + 1 < minPoints) continue;
        const seg = fitLine(cluster.slice(i, j + 1));
        if (segLength(seg) >= minLength) segments.push(seg);
      }
    }
    return segments;
  }

  function analyze(segments, { angleToleranceDeg = 8, lineToleranceM = 0.05, gapToleranceM = 0.10, numericToleranceM = TOL } = {}) {
    const relations = [], crossings = [], discarded = new Set();
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i], b = segments[j], rel = proximity(a, b, angleToleranceDeg, lineToleranceM, gapToleranceM);
      relations.push({ i, j, ...rel });
      const hit = intersection(a, b, numericToleranceM);
      if (hit) {
        const cutResult = cut(a, b, numericToleranceM);
        crossings.push({ i, j, ...hit, kept: cutResult.segment, cut: cutResult.changed });
      }
    }
    const merged = [];
    for (let i = 0; i < segments.length; i++) {
      if (discarded.has(i)) continue;
      let current = segments[i].map(p => [...p]);
      for (let j = i + 1; j < segments.length; j++) {
        if (!discarded.has(j) && proximity(current, segments[j], angleToleranceDeg, lineToleranceM, gapToleranceM).near) {
          current = merge(current, segments[j]); discarded.add(j);
        }
      }
      merged.push(current);
    }
    return { relations, crossings, merged };
  }

  root.LidarGeometry = { TOL, PARALLEL_EPS, angleDeg, pointSegmentDistance, lineDistance,
    intersection, cut, proximity, merge, fitLine, splitClusters, extractSegments, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LidarGeometry;
})(typeof globalThis !== 'undefined' ? globalThis : window);
