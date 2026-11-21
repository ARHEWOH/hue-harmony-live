'use strict';
(() => {
  const cfg = window.HUE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const origin = String(cfg.apiUrl || '').replace(/\/$/, '');
  const api = origin + '/api/live';
  const cacheKey = 'hue_harmony_last_live_v1';
  const fallback = {
    segment: 'WELCOME TO', title: 'HUE & HARMONY',
    description: 'A celebration of every shade that makes us who we are.',
    note: 'Stay close. The next activity is coming up!',
    badge: 'THE CELEBRATION', tone: 'welcome'
  };
  function show(scene) {
    const data = {...fallback, ...scene};
    $('scene-segment').textContent = data.segment || '';
    $('scene-title').textContent = data.title || '';
    $('scene-description').textContent = data.description || '';
    $('scene-label').textContent = data.badge || 'NOW HAPPENING';
    $('scene-note').textContent = data.note || '';
    $('scene-note-wrap').hidden = !data.note;
    document.body.dataset.tone = ['welcome','game','notice','award','break'].includes(data.tone) ? data.tone : 'welcome';
  }
  function status(msg, state) {
    $('status-text').textContent = msg;
    $('connection-dot').dataset.state = state;
  }
  let cached = null;
  try { const raw = localStorage.getItem(cacheKey); if (raw) cached = JSON.parse(raw); } catch (_) {}
  if (cached && typeof cached.title === 'string') {
    show(cached);
    status('Previous update · checking for latest…', 'idle');
  } else {
    show(fallback);
    status('Connecting to live feed…', 'idle');
  }
  async function refresh() {
    try {
      const response = await fetch(api, {cache:'no-store', headers:{Accept:'application/json'}});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!data || typeof data.title !== 'string') throw new Error('Invalid event update');
      show(data);
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
      const time = new Date(data.updated_at);
      const formatted = Number.isNaN(+time) ? 'just now' : time.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
      status('Updated ' + formatted, 'ok');
    } catch (_) {
      if (cached) {
        status('Offline · last saved activity · refresh to retry', 'error');
      } else {
        $('scene-description').textContent = 'Unable to reach the live event feed. Please refresh when connected.';
        $('scene-note-wrap').hidden = true;
        status('Connection unavailable · refresh to retry', 'error');
      }
    }
  }
  refresh();
})();
