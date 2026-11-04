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
 */
function loadApp(htmlFile = "index.html") {
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
    window: { isSecureContext: false },
    navigator: {},
    devicePixelRatio: 1,
    Blob: FakeBlob,
    URL,
    ResizeObserver: class { observe() {} },
    TextDecoder,
    performance,
    console,
    setTimeout: (f) => setTimeout(f, 0),
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

module.exports = { loadApp, ROOT };
