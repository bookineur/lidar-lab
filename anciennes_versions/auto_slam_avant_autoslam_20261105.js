/* Source commune du déclenchement Auto-SLAM pour les panneaux PC et téléphone. */
(function (root) {
  "use strict";
  function createAutoSlam({ enabled, blocked, capture, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let timer = null, running = false;
    function cancel() { if (timer !== null) clearTimer(timer); timer = null; }
    function schedule(delay = 500) {
      cancel();
      if (!enabled()) return;
      timer = setTimer(async () => {
        timer = null;
        if (!enabled()) return;
        if (running || blocked()) return schedule(250);
        running = true;
        try { await capture(); } finally { running = false; }
      }, Math.max(0, Number(delay) || 0));
    }
    return { schedule, cancel, get running() { return running; }, get pending() { return timer !== null; } };
  }
  root.LidarAutoSlam = { createAutoSlam };
})(typeof window !== "undefined" ? window : globalThis);
