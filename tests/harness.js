"use strict";
// Banc d'essai : exécute le VRAI script de index.html (V1) dans Node avec un DOM simulé minimal.
// Aucune logique de l'application n'est recopiée ici : on charge le fichier HTML tel quel,
// on remplace seulement document/canvas/téléchargement par des objets factices.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function parseDefaults(html) {
  const defaults = {};
  for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
    const attrs = m[1],
      id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    const value = (attrs.match(/\bvalue="([^"]*)"/) || [])[1];
    defaults[id] = { value: value === undefined ? "" : value, checked: /\bchecked\b/.test(attrs) };
  }
  for (const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const opts = [...m[2].matchAll(/<option\b([^>]*)>/g)].map((o) => ({ value: (o[1].match(/value="([^"]*)"/) || [])[1], selected: /\bselected\b/.test(o[1]) }));
    const sel = opts.find((o) => o.selected) || opts[0];
    defaults[m[1]] = { value: sel ? sel.value : "", checked: false };
  }
  return defaults;
}

function makeCtx() {
  const ctx = { fills: 0, fillStyle: "", strokeStyle: "", lineWidth: 1 };
  for (const k of ["scale", "fillRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "fillText"])
    ctx[k] = k === "fillRect" ? () => ctx.fills++ : () => {};
  return ctx;
}

/**
 * Charge une version de l'application.
 * @param {string} htmlFile chemin relatif à la racine du projet (ex. "index.html")
 * @param {object} [options] {serial} : faux navigator.serial (voir fakeSerial) ; la page est alors « sécurisée » (localhost)
 */
function loadApp(htmlFile = "index.html", options = {}) {
  const html = fs.readFileSync(path.join(ROOT, htmlFile), "utf8");
  const defaults = parseDefaults(html);
  const elements = new Map();
  const downloads = [];
  const blobs = new Map();
  let blobId = 0;
  const ctx = makeCtx();

  function makeElement(id) {
    const d = defaults[id] || { value: "", checked: false };
    const el = {
      id,
      value: d.value,
      checked: d.checked,
      textContent: "",
      innerHTML: "",
      disabled: false,
      style: {},
      dataset: {},
      clientWidth: 800,
      options: [],
      addEventListener() {},
      querySelectorAll: () => [],
      setPointerCapture() {},
      getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
      toBlob: (cb) => cb(null),
      click() {},
      append(o) {
        el.options.push(o);
        if (el.value === "" || el.value === undefined) el.value = String(o.value);
      },
    };
    // innerHTML = "" vide aussi les options d'un <select>
    let inner = "";
    Object.defineProperty(el, "innerHTML", {
      get: () => inner,
      set: (v) => {
        inner = v;
        if (v === "" && (id === "ref" || id === "target")) {
          el.options = [];
          el.value = "";
        }
      },
    });
    return el;
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) {
      const a = { tag, value: "", textContent: "", href: "", download: "", click() {
        if (tag === "a") downloads.push({ name: a.download, data: blobs.get(a.href) });
      } };
      return a;
    },
  };
  class FakeBlob {
    constructor(parts, opts) {
      this.parts = parts;
      this.type = opts && opts.type;
    }
  }
  const URL = {
    createObjectURL(blob) {
      const id = "blob:" + ++blobId;
      blobs.set(id, blob.parts.map((p) => (typeof p === "string" ? p : String(p))).join(""));
      return id;
    },
    revokeObjectURL() {},
  };
  const context = vm.createContext({
    document,
    window: { isSecureContext: !!options.serial },
    navigator: options.serial ? { serial: options.serial } : {},
    devicePixelRatio: 1,
    Blob: FakeBlob,
    URL,
    ResizeObserver: class { observe() {} },
    TextDecoder,
    performance,
    console,
    fetch: options.fetch || (() => Promise.reject(new Error("fetch unavailable in test"))),
    // vraies minuteries, plafonnées à 1 s (le délai d'attente de 15 s de la capture dure donc 1 s en test)
    setTimeout: (f, ms) => setTimeout(f, Math.min(Number(ms) || 0, 1000)),
    clearTimeout,
    Math, Number, Map, Set, Array, Object, JSON, Promise, Float32Array, String, Boolean, Error, Infinity, NaN, isFinite,
  });
  context.self = context;
  // Scripts externes éventuels (ex. lidar_core.js), dans l'ordre du HTML
  for (const m of html.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)) {
    const src = fs.readFileSync(path.join(ROOT, path.dirname(htmlFile), m[1]), "utf8");
    vm.runInContext(src, context, { filename: m[1] });
  }
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const expose = `
globalThis.__app = {
  scans,
  get importedGrid() { return importedGrid; }, set importedGrid(v) { importedGrid = v; },
  get lastGridCells() { return lastGridCells; },
  parseCsv, parseGridCsv, filteredScanPoints, filteredMapPoints, transformed,
  locateOnGrid, locateOnAccumulatedMap, anchorScanAt, accumulatedGridFor, getGridExportData, draw,
  select, renderSelectors,
  integrateAtCurrentPose: typeof integrateAtCurrentPose === "function" ? integrateAtCurrentPose : undefined,
};`;
  vm.runInContext(inline + expose, context, { filename: htmlFile });
  const app = context.__app;
  const $ = (id) => document.getElementById(id);

  return {
    app,
    $,
    ctx,
    downloads,
    /** Charge des fichiers CSV via le vrai champ « files » de l'application. */
    async loadFiles(files) {
      await $("files").onchange({ target: { files: files.map((f) => ({ name: f.name, text: async () => f.text })), value: "" } });
    },
    async loadGridFile(name, text) {
      await $("gridFile").onchange({ target: { files: [{ name, text: async () => text }], value: "" } });
    },
    /** Change un réglage comme le ferait l'utilisateur (déclenche oninput/onchange). */
    set(id, value) {
      const el = $(id);
      if (typeof value === "boolean") el.checked = value;
      else el.value = String(value);
      if (el.oninput) el.oninput();
      if (el.onchange) el.onchange();
    },
    click(id) {
      return $(id).onclick();
    },
    lastDownload(name) {
      for (let i = downloads.length - 1; i >= 0; i--) if (downloads[i].name === name) return downloads[i].data;
      return undefined;
    },
  };
}

/**
 * Faux port série Web Serial (SIMULATION) : imite la carte LD06_capture branchée en USB.
 * send(text, taille) envoie des octets découpés en paquets arbitraires, comme le fait l'USB ;
 * unplug() imite un câble débranché (read() lève une erreur).
 */
function fakeSerial() {
  const queue = [],
    log = [];
  let waiting = null,
    failure = null,
    cancelled = false;
  const wake = () => {
    if (!waiting) return;
    const w = waiting;
    if (failure) {
      waiting = null;
      w.reject(failure);
    } else if (cancelled) {
      waiting = null;
      w.resolve({ value: undefined, done: true });
    } else if (queue.length) {
      waiting = null;
      w.resolve({ value: queue.shift(), done: false });
    }
  };
  const reader = {
    read() {
      if (failure) return Promise.reject(failure);
      if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
      if (cancelled) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject };
      });
    },
    releaseLock() {
      log.push("releaseLock");
    },
    async cancel() {
      log.push("cancel");
      cancelled = true;
      wake();
    },
  };
  const port = {
    openedWith: null,
    closed: false,
    async open(o) {
      port.openedWith = o;
      port.closed = false;
      cancelled = false; // un port rouvert fournit un nouveau flux de lecture
      failure = null;
    },
    readable: { getReader: () => reader },
    async close() {
      port.closed = true;
    },
  };
  return {
    port,
    log,
    serial: { requestPort: async () => port },
    send(text, chunk = 61) {
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < bytes.length; i += chunk) queue.push(bytes.slice(i, i + chunk));
      wake();
    },
    unplug(message = "The device has been lost.") {
      failure = new Error(message);
      wake();
    },
  };
}

/** Faux DOM + ESP32 simulé pour tester le panneau Wi-Fi chargé comme script séparé. */
function loadRobotPanel(options = {}) {
  const elements = new Map(),
    listeners = new Map(),
    timers = new Set(),
    intervals = new Set(),
    calls = [],
    session = { version: 0, name: "simu", dossier: "simu", robot: { url: "http://robot-lidar.local" }, scans: [] };
  let scanId = 0,
    closed = false,
    renderCount = 0,
    selected = -1;
  function addElement(tag, attrs = {}) {
    const e = {
      tagName: tag.toUpperCase(), id: attrs.id || "", value: attrs.value || "", checked: /\bchecked\b/.test(attrs.raw || ""),
      disabled: false, textContent: "", style: {}, dataset: {}, options: [], listeners: {}, parentNode: null,
      addEventListener(name, fn) { (e.listeners[name] ||= []).push(fn); },
      fire(name, event = {}) { for (const fn of e.listeners[name] || []) fn({ currentTarget: e, preventDefault() {}, pointerId: 1, ...event }); },
      setPointerCapture() {}, append() {}, click() {},
      querySelectorAll(selector) { return cardQuery(e, selector); },
    };
    for (const key of ["data-move", "data-turn"]) if (attrs[key]) e.dataset[key.slice(5)] = attrs[key];
    if (e.id) elements.set(e.id, e);
    return e;
  }
  let panelButtons = [];
  function cardQuery(_root, selector) {
    if (selector === "[data-move]") return panelButtons.filter((e) => e.dataset.move);
    if (selector === "[data-turn]") return panelButtons.filter((e) => e.dataset.turn);
    if (selector === ".actions button") return panelButtons.filter((e) => e.className === "action");
    return [];
  }
  const card = addElement("section");
  card.className = "card";
  let html = "";
  Object.defineProperty(card, "innerHTML", { get: () => html, set: (value) => {
    html = value;
    panelButtons = [];
    elements.delete("robotWifiPc");
    for (const m of value.matchAll(/<(button|input|span|div)\b([^>]*)>/g)) {
      const attrs = m[2], id = (attrs.match(/\bid="([^"]+)"/) || [])[1], dataMove = (attrs.match(/\bdata-move="([^"]+)"/) || [])[1], dataTurn = (attrs.match(/\bdata-turn="([^"]+)"/) || [])[1];
      const e = addElement(m[1], { id, value: (attrs.match(/\bvalue="([^"]*)"/) || [])[1], "data-move": dataMove, "data-turn": dataTurn, raw: attrs });
      if (m[1] === "button") {
        e.className = /class="[^"]*primary/.test(attrs) ? "action" : /data-turn=/.test(attrs) ? "action" : "button";
        if (/class="[^"]*primary/.test(attrs)) e.className = "action";
        if (dataTurn) e.className = "action";
        panelButtons.push(e);
      }
    }
  }});
  const baseCard = { nextSibling: null, parentNode: { insertBefore() {} } };
  const document = {
    activeElement: { tagName: "BODY" },
    body: { prepend() {} },
    querySelector: (selector) => selector === "aside .card" ? baseCard : null,
    querySelectorAll: () => [],
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) { return tag === "section" ? card : addElement(tag); },
  };
  const rawScan = (id) => `# robot_wifi id=${id} hz=10.0 pts=60 pwm=40 moving=0\nangle_deg,distance_mm,intensity\n` + Array.from({ length: 60 }, (_, i) => `${i * 6},1000,200`).join("\n") + "\n";
  const jsonResponse = (body, ok = true) => ({ ok, json: async () => body, text: async () => JSON.stringify(body) });
  async function fetch(url, request = {}) {
    const parsed = new URL(url, "http://localhost"), route = parsed.pathname;
    calls.push({ method: request.method || "GET", url: parsed.pathname + parsed.search, body: request.body, at: Date.now() });
    if (route === "/api/status") return jsonResponse({ robot: "http://robot-lidar.local", online: true });
    if (route === "/api/session") return jsonResponse(session);
    if (route === "/api/robot/scan") return { ok: true, text: async () => rawScan(++scanId) };
    if (route === "/api/scan/" + encodeURIComponent(options.scanName || "scan_01.csv")) return { ok: true, text: async () => rawScan(scanId || 1) };
    if (route.startsWith("/api/robot/turn")) {
      if (options.turn) await options.turn(parsed.searchParams.get("deg"), calls);
      return { ok: true, text: async () => String(options.turnDuration || 300) };
    }
    if (route.startsWith("/api/robot/")) return { ok: true, text: async () => "ok" };
    if (route === "/api/capture" && request.method === "POST") {
      if (options.capture) await options.capture(request, calls);
      const name = options.scanName || "scan_01.csv";
      const scan = { name, pose: [1.25, -0.5, 17], reg: true, anchor: false, note: "recouvrement 80 %", points: 60 };
      session.scans.push(scan);
      session.version++;
      return jsonResponse({ ok: true, scan, session: structuredClone(session) });
    }
    return { ok: false, status: 404, text: async () => "not found", json: async () => ({}) };
  }
  const timer = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); if (!closed) fn(); }, Math.min(Number(ms) || 0, 1200));
    timers.add(id);
    return id;
  };
  const clearTimer = (id) => { timers.delete(id); clearTimeout(id); };
  const interval = (fn, ms) => { const id = setInterval(() => !closed && fn(), ms); intervals.add(id); return id; };
  const clearIntervalFake = (id) => { intervals.delete(id); clearInterval(id); };
  const scans = [],
    context = vm.createContext({
      document, fetch, console, URL, AbortController, setTimeout: timer, clearTimeout: clearTimer,
      setInterval: interval, clearInterval: clearIntervalFake,
      addEventListener(name, fn) { (listeners.get(name) || (listeners.set(name, []), listeners.get(name))).push(fn); },
      scans, active: 0, MAX_SCANS: 200, serialFrameCounter: 0, livePreviewScan: null,
      parseCsv(text, name) { return { name, pts: text.split("\n").filter((line) => /^\d/.test(line)).map((_, i) => ({ x: Math.cos(i), y: Math.sin(i), a: i * 6, r: 1, i: 200 })), pose: [0, 0, 0], visible: true, mapRegistered: false }; },
      renderSelectors() { renderCount++; }, draw() {}, select(i) { selected = i; context.active = i; },
      sleep: undefined,
      Math, Number, String, Object, Array, Set, Map, Promise, Error, JSON, Infinity, NaN,
    });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "serveur_robot", "auto_slam.js"), "utf8"), context, { filename: "auto_slam.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "serveur_robot", "pilote_lidar_lab.js"), "utf8"), context, { filename: "pilote_lidar_lab.js" });
  return {
    calls, scans, session, panelButtons,
    get renderCount() { return renderCount; }, get selected() { return selected; },
    el: (id) => elements.get(id),
    key(name, event = {}) { for (const fn of listeners.get(name) || []) fn({ key: event.key || "ArrowUp", preventDefault() {}, ...event }); },
    turn(deg = 45) { const b = panelButtons.find((e) => e.dataset.turn === String(deg)); return b && b.onclick(); },
    async wait(ms = 20) { await new Promise((resolve) => setTimeout(resolve, ms)); },
    close() { closed = true; for (const id of intervals) clearInterval(id); for (const id of timers) clearTimeout(id); },
  };
}

/** Laisse tourner la boucle de lecture série (promesses et minuteries en attente). */
const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

module.exports = { loadApp, fakeSerial, loadRobotPanel, settle, ROOT };
