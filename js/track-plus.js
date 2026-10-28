/*__rt_WRAP__*/;(function(window,location,document,self){/* track-plus.js v1 (zip 88) — tracking avancado DB/SR, porte do track-plus v3 da CNH (ADITIVO).
 * Nao altera o tracking atual (track.js / shared.js / helpers.js / funil_utms / __getTrackProps):
 *  - captura TODOS os parametros de campanha da URL (utm_* + cloaker cck/cname/adset/... + fbclid/src/sck),
 *    aceita chaves "?cck"/"%3Fcck" e query dentro do hash, ignora "organic"/"::"/"{{...}}"
 *  - deriva utm_* do cloaker (formato UTMify nome|id) e persiste em localStorage (trackPlus), sessionStorage e cookie trk
 *  - completa a URL atual (replaceState) ANTES de track.js/shared.js rodarem -> eles capturam normalmente
 *  - completa (so o que falta) as chaves que o funil ja usa: funil_utms e desenrola_params
 *  - POST api_proxy.php?action=trk em todo carregamento: grava a sessao no servidor e recebe o sid
 *    (tambem em cookie HTTP trk_sid) + o que o servidor ja conhece (sid / fbclid / IP+aparelho)
 *  - envolve fetch/XMLHttpRequest: toda chamada ao api_proxy.php leva o header X-Trk (sid + parametros)
 *    e o create_pix recebe trackProps/tracking completados + trackPlus/trk_id/page_url, mesmo que o
 *    localStorage/cookie JS tenham sido perdidos (navegador interno do Instagram/Facebook no iPhone)
 */
(function () {
  try {
    var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
    var EXTRA = ['fbclid', 'src', 'sck', 'xcod', 'ttclid', 'gclid',
                 'cck', 'cname', 'domain', 'placement', 'adset', 'adname', 'site', 'xgo'];
    var ALL = UTM.concat(EXTRA);
    var LS_KEY = 'trackPlus', COOKIE = 'trk', SID_KEY = 'trk_sid', FUNIL_UTMS = 'funil_utms', PARAMS_KEY = 'desenrola_params';
    var BASE = (function () {
      try {
        var s = (document.currentScript && document.currentScript.src) || '';
        var m = s.match(/^(.*\/)js\/track-plus\.js/);
        if (m) return m[1];
      } catch (e) {}
      return '/';
    })();
    var TRK_URL = BASE + 'api_proxy.php?action=trk';

    function readJson(get) { try { var v = get(); return v ? JSON.parse(v) : {}; } catch (e) { return {}; } }
    function readCookie() {
      try {
        var m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
        return m ? JSON.parse(decodeURIComponent(m[1])) : {};
      } catch (e) { return {}; }
    }
    function isEmpty(v) { return v === undefined || v === null || v === '' || v === 'null' || v === 'undefined'; }
    function isJunk(k, v) { if (isEmpty(v)) return true; if (String(k).indexOf('utm_') !== 0) return false; var s = String(v); return /^organic/i.test(s) || s === '::' || s.indexOf('{{') >= 0; }
    function merge(base, add) {
      for (var k in add) if (Object.prototype.hasOwnProperty.call(add, k) && !isJunk(k, add[k]) && isJunk(k, base[k])) base[k] = String(add[k]);
      return base;
    }
    function has(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && !isJunk(k, o[k])) return true; return false; }
    function normKey(k) { return String(k || '').replace(/^(?:%3F|\?|amp;|&)+/i, '').toLowerCase(); }

    // 1) URL atual (prioridade maxima)
    var fromUrl = {};
    function grabQuery(qs) {
      try {
        var p = new URLSearchParams(qs);
        p.forEach(function (v, k) { var nk = normKey(k); if (ALL.indexOf(nk) >= 0 && !isJunk(nk, v) && isJunk(nk, fromUrl[nk])) fromUrl[nk] = v; });
      } catch (e) {}
    }
    grabQuery(window.location.search);
    try { var hq = window.location.hash.indexOf('?'); if (hq >= 0) grabQuery(window.location.hash.substring(hq)); } catch (e) {}

    // 1b) campanha nova na URL -> utm_* derivadas DA URL (nunca herda utm_* de campanha antiga)
    function derive(o) {
      if (isJunk('utm_campaign', o.utm_campaign) && (!isEmpty(o.cname) || !isEmpty(o.cck))) {
        o.utm_campaign = !isEmpty(o.cname) && !isEmpty(o.cck) ? o.cname + '|' + o.cck : (o.cname || o.cck);
      }
      if (isJunk('utm_id', o.utm_id) && !isEmpty(o.cck)) o.utm_id = o.cck;
      if (isJunk('utm_medium', o.utm_medium) && !isEmpty(o.adset)) o.utm_medium = o.adset;
      if (isJunk('utm_content', o.utm_content) && !isEmpty(o.adname)) o.utm_content = o.adname;
      if (isJunk('utm_term', o.utm_term) && !isEmpty(o.placement)) o.utm_term = o.placement;
      if (isJunk('utm_source', o.utm_source) && (!isEmpty(o.site) || !isEmpty(o.cck) || !isEmpty(o.fbclid))) o.utm_source = o.site || 'FB';
      return o;
    }
    var CAMPAIGN_KEYS = ['cck', 'cname', 'adset', 'adname', 'placement', 'site', 'utm_source', 'utm_campaign', 'utm_id'];
    var newCampaign = CAMPAIGN_KEYS.some(function (k) { return !isJunk(k, fromUrl[k]); });
    if (newCampaign) derive(fromUrl);

    // 2) Fontes salvas
    var saved = {};
    merge(saved, fromUrl);
    var sources = [
      function () { return localStorage.getItem(LS_KEY); },
      function () { return sessionStorage.getItem(LS_KEY); },
      function () { return JSON.stringify(readCookie()); },
      function () { return localStorage.getItem(FUNIL_UTMS); },
      function () { return localStorage.getItem(PARAMS_KEY); }
    ];
    var strip = function (o) { UTM.concat(['cck', 'cname', 'adset', 'adname', 'placement', 'site', 'fbclid', 'fbc']).forEach(function (k) { delete o[k]; }); return o; };
    sources.forEach(function (g) { var o = readJson(g); merge(saved, newCampaign ? strip(o) : o); });

    // 3) Deriva utm_* do cloaker quando nao veio utm_*
    derive(saved);
    if (!isEmpty(saved.fbclid) && isEmpty(saved.fbc)) saved.fbc = 'fb.1.' + Date.now() + '.' + saved.fbclid;
    UTM.concat(['fbclid', 'fbc']).forEach(function (k) { if (isJunk(k, saved[k])) delete saved[k]; });
    for (var kk in saved) if (Object.prototype.hasOwnProperty.call(saved, kk) && ALL.concat(['fbc', 'fbp']).indexOf(kk) < 0) delete saved[kk];

    // 4) Persiste
    function persist() {
      if (!has(saved)) return;
      var json = JSON.stringify(saved);
      try { localStorage.setItem(LS_KEY, json); } catch (e) {}
      try { sessionStorage.setItem(LS_KEY, json); } catch (e) {}
      try {
        var exp = new Date(Date.now() + 90 * 864e5).toUTCString();
        document.cookie = COOKIE + '=' + encodeURIComponent(json) + '; expires=' + exp + '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
      } catch (e) {}
    }
    // 5) Completa (so o que falta) as chaves que o funil ja usa
    function fillStore(key, keys) {
      try {
        var o = readJson(function () { return localStorage.getItem(key); });
        if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
        var before = JSON.stringify(o), changed = false;
        keys.forEach(function (k) { if (!isJunk(k, saved[k]) && isJunk(k, o[k])) { o[k] = saved[k]; changed = true; } });
        if (changed && JSON.stringify(o) !== before) localStorage.setItem(key, JSON.stringify(o));
      } catch (e) {}
    }
    function fillStores() {
      if (!has(saved)) return;
      fillStore(FUNIL_UTMS, UTM.concat(['src', 'sck', 'fbc', 'fbp', 'gclid']));
      fillStore(PARAMS_KEY, UTM.concat(['fbclid', 'src', 'sck', 'cck', 'cname', 'adset', 'adname', 'placement', 'site', 'xcod', 'gclid', 'ttclid']));
    }
    // 6) Completa a URL atual (sem recarregar) — track.js/shared.js leem location.search logo depois
    function fillUrl() {
      try {
        if (!has(saved) || !window.history || !history.replaceState) return;
        var p = new URLSearchParams(window.location.search), changed = false;
        UTM.concat(['fbclid', 'src', 'sck']).forEach(function (k) { if (!isJunk(k, saved[k]) && isJunk(k, p.get(k))) { p.set(k, saved[k]); changed = true; } });
        if (!changed) return;
        history.replaceState(history.state, document.title, window.location.pathname + '?' + p.toString() + window.location.hash);
      } catch (e) {}
    }
    persist();
    fillStores();
    window.__trackPlus = saved;
    fillUrl();

    // 7) id de sessao (sid) + header X-Trk (base64url de {sid, p:{...}})
    function getSid() {
      var s = '';
      try { s = localStorage.getItem(SID_KEY) || ''; } catch (e) {}
      try { if (!s) s = sessionStorage.getItem(SID_KEY) || ''; } catch (e) {}
      try { if (!s) { var m = document.cookie.match(/(?:^|; )trk_sid_js=([a-f0-9]{16,64})/); if (m) s = m[1]; } } catch (e) {}
      return /^[a-f0-9]{16,64}$/.test(s) ? s : '';
    }
    function setSid(s) {
      if (!/^[a-f0-9]{16,64}$/.test(String(s || ''))) return;
      window.__trkSid = s;
      try { localStorage.setItem(SID_KEY, s); } catch (e) {}
      try { sessionStorage.setItem(SID_KEY, s); } catch (e) {}
      try { document.cookie = 'trk_sid_js=' + s + '; expires=' + new Date(Date.now() + 90 * 864e5).toUTCString() + '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) {}
    }
    window.__trkSid = getSid();
    function b64url(str) {
      try { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; }
    }
    function trkHeader() {
      try {
        var cur = window.__trackPlus || {};
        if (!window.__trkSid && !has(cur)) return '';
        var h = b64url(JSON.stringify({ sid: window.__trkSid || '', p: cur }));
        return h.length > 6000 ? b64url(JSON.stringify({ sid: window.__trkSid || '' })) : h;
      } catch (e) { return ''; }
    }
    window.__trkHeader = trkHeader;

    // 8) envolve fetch/XHR: header X-Trk em toda chamada ao api_proxy.php; body do create_pix completado
    function isApi(u) { u = String(u || ''); return /(?:^|\/)api_proxy\.php(?:\?|$)/.test(u); }
    function isPix(u) { u = String(u || ''); return isApi(u) && /[?&]action=create_pix(?:&|$)/.test(u); }
    var TRACK_KEYS = UTM.concat(['fbc', 'fbp']);
    function fillObj(o, keys, cur) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
      keys.forEach(function (k) { if (isJunk(k, o[k]) && !isJunk(k, cur[k])) o[k] = cur[k]; });
      return o;
    }
    function enrichBody(body) {
      try {
        if (typeof body !== 'string' || body.charAt(0) !== '{') return body;
        var o = JSON.parse(body);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return body;
        var cur = window.__trackPlus || {};
        if (has(cur)) {
          if (o.trackProps !== undefined || o.tracking === undefined) o.trackProps = fillObj(o.trackProps, TRACK_KEYS, cur);
          if (o.tracking !== undefined) o.tracking = fillObj(o.tracking, TRACK_KEYS.concat(['fbclid', 'src', 'sck']), cur);
          o.trackPlus = cur;
        }
        if (window.__trkSid) o.trk_id = window.__trkSid;
        o.page_url = window.location.href;
        return JSON.stringify(o);
      } catch (e) { return body; }
    }
    var origFetch = window.fetch;
    window.__trkOrigFetch = origFetch;
    if (typeof origFetch === 'function' && !window.__trkFetchPatched) {
      window.__trkFetchPatched = true;
      window.fetch = function (input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : '');
          if (url && isApi(url)) {
            init = init ? Object.assign({}, init) : {};
            var h = new Headers(init.headers || (input && input.headers) || undefined);
            var th = trkHeader();
            if (th && !h.has('X-Trk')) h.set('X-Trk', th);
            init.headers = h;
            if (!init.credentials) init.credentials = 'same-origin';
            if (isPix(url) && typeof init.body === 'string') init.body = enrichBody(init.body);
          }
        } catch (e) {}
        return origFetch.call(this, input, init);
      };
    }
    if (window.XMLHttpRequest && XMLHttpRequest.prototype.open && !XMLHttpRequest.prototype.__trkPatched) {
      XMLHttpRequest.prototype.__trkPatched = true;
      var xOpen = XMLHttpRequest.prototype.open, xSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        try { this.__trkUrl = String(url || ''); } catch (e) {}
        return xOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        try {
          if (this.__trkUrl && isApi(this.__trkUrl)) {
            var th = trkHeader();
            if (th) { try { this.setRequestHeader('X-Trk', th); } catch (e) {} }
            if (isPix(this.__trkUrl) && typeof body === 'string') body = enrichBody(body);
          }
        } catch (e) {}
        return xSend.call(this, body);
      };
    }

    // 9) grava a sessao NO SERVIDOR e completa com o que ele ja conhece (sid/fbclid/IP+aparelho)
    function applyServer(j) {
      try {
        if (!j || typeof j !== 'object') return;
        if (j.sid) setSid(j.sid);
        if (j.trk && typeof j.trk === 'object') {
          var before = JSON.stringify(saved);
          merge(saved, j.trk);
          derive(saved);
          if (JSON.stringify(saved) !== before) { window.__trackPlus = saved; persist(); fillStores(); fillUrl(); }
        }
      } catch (e) {}
    }
    function syncServer() {
      var payload = { params: saved, url: window.location.href };
      if (window.__trkSid) payload.trk_id = window.__trkSid;
      var body = JSON.stringify(payload);
      var headers = { 'Content-Type': 'application/json' };
      var th = trkHeader(); if (th) headers['X-Trk'] = th;
      var done = false;
      try {
        origFetch.call(window, TRK_URL, { method: 'POST', credentials: 'same-origin', keepalive: true, cache: 'no-store', headers: headers, body: body })
          .then(function (r) { return r.json(); })
          .then(function (j) { done = true; applyServer(j); })
          .catch(function () { if (!done) { try { navigator.sendBeacon && navigator.sendBeacon(TRK_URL, new Blob([body], { type: 'application/json' })); } catch (e) {} } });
      } catch (e) {
        try { navigator.sendBeacon && navigator.sendBeacon(TRK_URL, new Blob([body], { type: 'application/json' })); } catch (e2) {}
      }
    }
    syncServer();
    try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && has(saved)) syncServer(); }); } catch (e) {}
  } catch (e) { try { console.warn('track-plus', e); } catch (_) {} }
})();

}).call(globalThis,(typeof globalThis!=="undefined"&&globalThis.__rt_W)||window,(typeof globalThis!=="undefined"&&globalThis.__rt_L)||location,(typeof globalThis!=="undefined"&&globalThis.__rt_DOC)||document,(typeof globalThis!=="undefined"&&globalThis.__rt_W)||self);