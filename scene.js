/* Maquette 3D du campus — three.js. Repère du site : x est, y nord (m). Scène : X = x-140, Z = -(y-220), Y vers le haut.
   Sol : orthophoto 2025 du Géoportail ; arbres placés là où la photo montre du couvert ; personnages Microsoft Rocketbox (MIT). */
(function () {
  var D = window.TC, T = window.THREE, stage = document.getElementById("stage"), hud = document.getElementById("hud");
  var api = { visible: function () { } }; window.TCScene = api;
  if (!T || !stage) return;
  var renderer, scene, cam, composer = null, ssao, fxaa, hq = true, started = false, running = false, raf = 0, last = 0;
  var roofs = [], labels = [], ghosts = [], floodM, spots = [];
  var mode = "orbit", orbit = { th: -0.62, ph: 1.02, r: 380, tx: 0, tz: 8 }, walk = { x: 135, y: 296, h: 1.7, yaw: 0, pitch: 0 };
  var keys = {}, pad = {}, PL = D.plinth, seed = 11, idle = 99, calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches, shown = false;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function X(x) { return x - 140; } function Z(y) { return -(y - 220); }

  /* ---------- textures procédurales ---------- */
  function tex(w, h, draw, rx, ry) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); t.anisotropy = 8; return t; }
  function speck(base, cols, n, s) { return function (k, w, h) { k.fillStyle = base; k.fillRect(0, 0, w, h); for (var i = 0; i < n; i++) { k.fillStyle = cols[i % cols.length]; k.globalAlpha = 0.1 + rnd() * 0.25; var r = (s || 1) * (0.5 + rnd() * 1.6); k.fillRect(rnd() * w, rnd() * h, r, r); } k.globalAlpha = 1; }; }
  function stripes(cols, n, gap) { return function (k, w, h) { var sw = w / n; for (var i = 0; i < n; i++) { k.fillStyle = cols[Math.floor(rnd() * cols.length)]; k.fillRect(i * sw, 0, sw + 1, h); k.fillStyle = "rgba(0,0,0," + (gap || 0.35) + ")"; k.fillRect(i * sw, 0, Math.max(1, sw * 0.12), h); } for (i = 0; i < 400; i++) { k.fillStyle = "rgba(0,0,0,0.05)"; k.fillRect(rnd() * w, rnd() * h, 1, 6 + rnd() * 30); } }; }
  function S(o) { if (o.envMapIntensity === undefined) o.envMapIntensity = 0.42; if (o.roughness === undefined) o.roughness = 0.9; if (o.metalness === undefined) o.metalness = 0; return new T.MeshStandardMaterial(o); }
  var M;
  function materials() {
    M = {
      grass: S({ map: tex(256, 256, speck("#5f8449", ["#4f733c", "#6f9456", "#7a9c60", "#476a37"], 5200, 1.4), 0.16, 0.16), roughness: 1 }),
      clay: S({ map: tex(256, 256, speck("#b9603a", ["#a8522f", "#c97145", "#9c4a2a", "#d08257"], 4200, 1.2), 0.25, 0.25), roughness: 1 }),
      hardG: S({ map: tex(128, 128, speck("#3d7a5c", ["#356d51", "#458665"], 1500), 0.25, 0.25), roughness: 0.85 }),
      hardB: S({ map: tex(128, 128, speck("#2b648f", ["#255a82", "#32709e"], 1500), 0.3, 0.3), roughness: 0.8 }),
      padel: S({ map: tex(128, 128, speck("#1f5fa8", ["#1b5496", "#2a6cb8"], 2200), 0.3, 0.3), roughness: 0.95 }),
      conc: S({ map: tex(256, 256, speck("#c4c0b6", ["#b5b1a7", "#d0ccc2", "#a9a59b"], 3000, 1.5), 0.12, 0.12), roughness: 0.92 }),
      paving: S({ map: tex(128, 128, function (k, w, h) { speck("#cfc7b4", ["#c2baa6", "#dbd3c0"], 900)(k, w, h); k.strokeStyle = "rgba(90,84,70,0.45)"; k.lineWidth = 1; k.strokeRect(0.5, 0.5, w / 2, h / 2); k.strokeRect(w / 2 + 0.5, 0.5, w / 2, h / 2); k.strokeRect(0.5 - w / 4, h / 2 + 0.5, w / 2, h / 2); k.strokeRect(w / 4 + 0.5, h / 2 + 0.5, w / 2, h / 2); k.strokeRect(w * 0.75 + 0.5, h / 2 + 0.5, w / 2, h / 2); }, 0.5, 0.5), roughness: 0.95 }),
      asphalt: S({ map: tex(128, 128, speck("#6f706c", ["#62635f", "#7b7c78", "#585955"], 2600), 0.3, 0.3), roughness: 0.97 }),
      gravel: S({ map: tex(128, 128, speck("#c9bfa6", ["#b8ae95", "#d8ceb6", "#a89e86"], 2600), 0.4, 0.4), roughness: 1 }),
      wood: S({ map: tex(256, 64, stripes(["#b98a5a", "#c59868", "#ad7f50", "#cfa373", "#a57648"], 32), 6, 1), roughness: 0.8 }),
      woodDark: S({ map: tex(256, 64, stripes(["#7b5a3c", "#876545", "#6f5035"], 32), 6, 1), roughness: 0.8 }),
      glulam: S({ color: 0xc9a06d, roughness: 0.7 }),
      roof: S({ map: tex(256, 64, stripes(["#d9dcdf", "#d2d5d9", "#dfe2e5"], 24, 0.22), 10, 1), roughness: 0.55, metalness: 0.35, side: T.DoubleSide }),
      ceiling: S({ color: 0xe9e2d2, roughness: 0.9, side: T.DoubleSide }),
      wall: S({ color: 0xeceae4, roughness: 0.9 }), white: S({ color: 0xf2f1ec, roughness: 0.85, side: T.DoubleSide }),
      dark: S({ color: 0x2a2f3a, roughness: 0.6 }), steel: S({ color: 0x8a909a, roughness: 0.45, metalness: 0.7 }), seat: S({ color: 0x23406b, roughness: 0.6 }),
      glass: S({ color: 0x9fc4d6, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.42, side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.0 }),
      poly: S({ color: 0xf1f5f7, roughness: 0.35, transparent: true, opacity: 0.8, side: T.DoubleSide, envMapIntensity: 0.5 }),
      fence: new T.MeshBasicMaterial({ color: 0x24402f, transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false }),
      net: new T.MeshBasicMaterial({ color: 0x15181f, transparent: true, opacity: 0.6, side: T.DoubleSide }),
      line: new T.MeshBasicMaterial({ color: 0xf4f4f0 }), led: new T.MeshBasicMaterial({ color: 0xfffbe8 }),
      ctx: S({ color: 0xd8d4cb, roughness: 0.9 }), ctxRoof: S({ color: 0x8f9499, roughness: 0.8 }), tile: S({ color: 0x7a5a4a, roughness: 0.9 }), pv: S({ color: 0x1c2740, roughness: 0.25, metalness: 0.6 }),
      trunk: S({ color: 0x5b4a39, roughness: 1 }), leaf: S({ color: 0xffffff, roughness: 1, envMapIntensity: 0.3 }),
      tyre: S({ color: 0x1b1c1f, roughness: 0.9 }), carGlass: S({ color: 0x10171e, roughness: 0.08, metalness: 0.85, envMapIntensity: 0.7 }),
      carPaint: S({ color: 0xffffff, roughness: 0.34, metalness: 0.25, envMapIntensity: 0.75 }), carTrim: S({ color: 0xffffff, roughness: 0.55, metalness: 0.2, vertexColors: true }),
      parquet: S({ map: tex(256, 64, stripes(["#a9825a", "#b48c62", "#9d7650", "#bd966b"], 20, 0.18), 3, 1), roughness: 0.55 }),
      tileW: S({ map: tex(64, 64, function (k, w, h) { k.fillStyle = "#eef1f0"; k.fillRect(0, 0, w, h); k.strokeStyle = "rgba(120,130,130,0.55)"; k.strokeRect(0.5, 0.5, w / 2, h / 2); k.strokeRect(w / 2 + 0.5, 0.5, w / 2, h / 2); k.strokeRect(0.5, h / 2 + 0.5, w / 2, h / 2); k.strokeRect(w / 2 + 0.5, h / 2 + 0.5, w / 2, h / 2); }, 4, 4), roughness: 0.3 }),
      tileD: S({ color: 0x59636a, roughness: 0.5 }), stone: S({ color: 0xe6e2da, roughness: 0.25 }), mirror: S({ color: 0xdfe7ea, roughness: 0.03, metalness: 1, envMapIntensity: 1.4 }),
      chrome: S({ color: 0xc9ced3, roughness: 0.2, metalness: 0.9, envMapIntensity: 1.2 }), gold: S({ color: 0xd2a94a, roughness: 0.3, metalness: 0.8, envMapIntensity: 1.2 }),
      fabA: S({ color: 0x1f5a45, roughness: 0.95 }), fabB: S({ color: 0xb5512c, roughness: 0.95 }), fabC: S({ color: 0x2c4f7c, roughness: 0.95 }), fabD: S({ color: 0x8a8577, roughness: 0.95 }),
      rug: S({ color: 0xcfc5ae, roughness: 1 }), lockA: S({ color: 0x1f5a45, roughness: 0.5, metalness: 0.3 }), lockB: S({ color: 0xd9d6cc, roughness: 0.5, metalness: 0.3 }),
      botG: S({ color: 0x3f6b3a, roughness: 0.15, metalness: 0.4 }), botA: S({ color: 0x9b5a1e, roughness: 0.15, metalness: 0.4 }), botC: S({ color: 0xcfd8dc, roughness: 0.1, metalness: 0.5 }),
      plant: S({ color: 0x3c6b34, roughness: 1 }), ball: S({ color: 0xd7f24a, roughness: 0.8 }), red: S({ color: 0xb23a2a, roughness: 0.6 }), blue: S({ color: 0x2b5c9a, roughness: 0.6 }),
      lamp: new T.MeshBasicMaterial({ color: 0xffe9bf }), screen: new T.MeshBasicMaterial({ color: 0x9fd0e6 })
    };
  }
  /* ---------- primitives ---------- */
  var BOX = null;
  function box(g, w, h, d, m, x, y, z, sh) { BOX = BOX || new T.BoxGeometry(1, 1, 1); var b = new T.Mesh(BOX, m); b.scale.set(w, h, d); b.position.set(x, y, z); if (sh !== false) { b.castShadow = true; b.receiveShadow = true; } if (m.transparent) ghosts.push(b); g.add(b); return b; }
  function slab(g, o, h, m, y0, sh) { return box(g, o.w, h, o.d, m, X(o.x + o.w / 2), (y0 || 0) + h / 2, Z(o.y + o.d / 2), sh); }
  function muv(ge, w, d) { var u = ge.attributes.uv; for (var i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w, u.getY(i) * d); return ge; }
  function plane(g, o, m, y) { var p = new T.Mesh(muv(new T.PlaneGeometry(o.w, o.d), o.w, o.d), m); p.rotation.x = -Math.PI / 2; p.position.set(X(o.x + o.w / 2), y, Z(o.y + o.d / 2)); p.receiveShadow = true; if (m.transparent) ghosts.push(p); g.add(p); return p; }
  function ribbon(g, pts, w, m, y) { for (var i = 0; i < pts.length - 1; i++) { var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy); var r = new T.Mesh(muv(new T.PlaneGeometry(w, len + w * 0.6), w, len), m); r.rotation.x = -Math.PI / 2; r.rotation.z = -Math.atan2(dx, dy); r.position.set(X((a[0] + b[0]) / 2), y, Z((a[1] + b[1]) / 2)); r.receiveShadow = true; g.add(r); } }
  function court(g, o, m, y, lit) { // surface de jeu, axe long nord-sud ; o = emprise avec dégagements
    plane(g, o, m, y);
    var cx = X(o.x + o.w / 2), cz = Z(o.y + o.d / 2), L = 23.77, Wd = 10.97, Ws = 8.23, t = 0.06, yy = y + 0.012;
    function ln(w, d, dx, dz) { var p = new T.Mesh(new T.PlaneGeometry(w, d), M.line); p.rotation.x = -Math.PI / 2; p.position.set(cx + dx, yy, cz + dz); g.add(p); }
    ln(t, L, -Wd / 2, 0); ln(t, L, Wd / 2, 0); ln(t, L, -Ws / 2, 0); ln(t, L, Ws / 2, 0); ln(Wd, t, 0, -L / 2); ln(Wd, t, 0, L / 2); ln(Ws, t, 0, -6.4); ln(Ws, t, 0, 6.4); ln(t, 12.8, 0, 0);
    var n = new T.Mesh(new T.PlaneGeometry(12.8, 1), M.net); n.position.set(cx, y + 0.5, cz); g.add(n); ghosts.push(n);
    box(g, 12.8, 0.06, 0.03, M.line, cx, y + 1.0, cz, false); box(g, 0.1, 1.07, 0.1, M.dark, cx - 6.4, y + 0.53, cz); box(g, 0.1, 1.07, 0.1, M.dark, cx + 6.4, y + 0.53, cz);
    if (lit) [[-8.7, -13], [8.7, -13], [-8.7, 13], [8.7, 13]].forEach(function (p) { box(g, 0.14, 9, 0.14, M.steel, cx + p[0], 4.5, cz + p[1]); box(g, 1.0, 0.16, 0.5, M.dark, cx + p[0] * 0.93, 9, cz + p[1], false); });
  }
  function fenceRect(g, x0, y0, w, d, h) {
    [[w, x0 + w / 2, y0, 0], [w, x0 + w / 2, y0 + d, 0], [d, x0, y0 + d / 2, 1], [d, x0 + w, y0 + d / 2, 1]].forEach(function (s) { var p = new T.Mesh(new T.PlaneGeometry(s[0], h), M.fence); p.position.set(X(s[1]), h / 2, Z(s[2])); if (s[3]) p.rotation.y = Math.PI / 2; g.add(p); ghosts.push(p); });
    var n = Math.round(w / 6.1), i; for (i = 0; i <= n; i++) { box(g, 0.07, h, 0.07, M.steel, X(x0 + i * w / n), h / 2, Z(y0), false); box(g, 0.07, h, 0.07, M.steel, X(x0 + i * w / n), h / 2, Z(y0 + d), false); }
    n = Math.round(d / 6.1); for (i = 1; i < n; i++) { box(g, 0.07, h, 0.07, M.steel, X(x0), h / 2, Z(y0 + i * d / n), false); box(g, 0.07, h, 0.07, M.steel, X(x0 + w), h / 2, Z(y0 + i * d / n), false); }
  }
  function vault(len, span, eave, rise, m, drop, uvRep) { // voûte : longueur le long de X, portée le long de Z
    var N = 28, pos = [], uv = [], idx = [];
    for (var i = 0; i <= N; i++) { var t = -1 + 2 * i / N, z = t * span / 2, y = eave + rise * (1 - t * t) - (drop || 0); pos.push(-len / 2, y, z, len / 2, y, z); uv.push(0, i / N, uvRep || 1, i / N); }
    for (i = 0; i < N; i++) { var a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return new T.Mesh(g, m);
  }
  function gable(span, rise, m) { var s = new T.Shape(); s.moveTo(-span / 2, 0); for (var i = 0; i <= 24; i++) { var t = -1 + 2 * i / 24; s.lineTo(t * span / 2, rise * (1 - t * t)); } var me = new T.Mesh(new T.ShapeGeometry(s), m); me.rotation.y = Math.PI / 2; return me; }
  function hall(g, o, floorM, glazed) {
    var cx = X(o.x + o.w / 2), cz = Z(o.y + o.d / 2), base = PL, nb = Math.round(o.w / 9.25), i;
    slab(g, { x: o.x - 3, y: o.y - 3, w: o.w + 6, d: o.d + 6 }, PL, M.conc, 0);
    plane(g, o, floorM, base + 0.02);
    var wd = M.wood.clone(); wd.map = M.wood.map.clone(); wd.map.needsUpdate = true; wd.map.repeat.set(o.w / 3, 1);
    [-1, 1].forEach(function (s) { // longs pans : soubassement, bandeau vitré, bardage bois, bandeau translucide
      var z = cz + s * (o.d / 2);
      box(g, o.w, 0.9, 0.35, M.conc, cx, base + 0.45, z);
      box(g, o.w, 2.5, 0.08, s === glazed ? M.glass : M.poly, cx, base + 2.15, z, false);
      box(g, o.w, o.eave - 5.4, 0.3, wd, cx, base + 3.4 + (o.eave - 5.4) / 2, z);
      box(g, o.w, 2.0, 0.1, M.poly, cx, base + o.eave - 1.0, z, false);
      for (i = 0; i <= nb; i++) box(g, 0.28, o.eave, 0.5, M.glulam, cx - o.w / 2 + i * o.w / nb, base + o.eave / 2, z - s * 0.28);
    });
    var wg = M.wood.clone(); wg.map = M.wood.map.clone(); wg.map.needsUpdate = true; wg.map.repeat.set(o.d / 3, 1);
    [-1, 1].forEach(function (s) { var x = cx + s * (o.w / 2); box(g, 0.3, o.eave, o.d, wg, x, base + o.eave / 2, cz); var gb = gable(o.d, o.rise, M.white); gb.position.set(x, base + o.eave, cz); gb.castShadow = true; g.add(gb); });
    var r = new T.Group(), rm = M.roof.clone(); rm.map = M.roof.map.clone(); rm.map.needsUpdate = true; rm.map.repeat.set(o.w / 6, 1);
    var v = vault(o.w + 1.4, o.d + 1.8, base + o.eave, o.rise, rm, -0.14); v.position.set(cx, 0, cz); v.castShadow = true; v.receiveShadow = true; r.add(v);
    var c = vault(o.w, o.d, base + o.eave, o.rise, M.ceiling, 0.1); c.position.set(cx, 0, cz); r.add(c);
    var sk = vault(o.w - 6, 3.2, base + o.eave + o.rise - 0.05, 0.12, M.poly, -0.2); sk.position.set(cx, 0, cz); r.add(sk); ghosts.push(sk);
    for (i = 0; i <= nb; i++) { var a = vault(0.3, o.d, base + o.eave, o.rise, M.glulam, 0.45); a.position.set(cx - o.w / 2 + i * o.w / nb, 0, cz); r.add(a); var b2 = vault(0.3, o.d, base + o.eave, o.rise, M.glulam, 0.12); b2.position.copy(a.position); r.add(b2); }
    for (i = 0; i < nb; i++) [-0.28, 0.28].forEach(function (f) { box(r, 5.2, 0.08, 0.5, M.led, cx - o.w / 2 + (i + 0.5) * o.w / nb, base + o.eave + o.rise * (1 - f * f * 4) - 0.75, cz + f * o.d, false); });
    g.add(r); roofs.push(r);
  }
  /* ---------- club-house : rez-de-chaussée (accueil, vestiaires, boutique) et étage (restaurant, bar, cuisine, terrasse) ---------- */
  function clubhouse(g, C) {
    var F0 = PL + 0.02, F1 = PL + 3.9, H0 = 3.56, H1 = 3.3, HOLE = { u0: 28.6, u1: 30.8, v0: 9.6, v1: 16.4 }, i, k;
    function cu(u) { return X(C.x + u); } function cv(v) { return Z(C.y + v); }
    function cb(m, u0, v0, w, d, y0, h) { ib(m, w, h, d, cu(u0 + w / 2), y0 + h / 2, cv(v0 + d / 2)); }
    function wall(axis, at, a0, a1, base, H, gaps, m) { // cloison avec baies de porte
      var t = 0.14, cur = a0; (gaps || []).concat([[a1, a1]]).forEach(function (gp) { if (gp[0] > cur) { if (axis === "u") cb(m || "wall", at - t / 2, cur, t, gp[0] - cur, base, H); else cb(m || "wall", cur, at - t / 2, gp[0] - cur, t, base, H); } if (gp[1] > gp[0]) { if (axis === "u") { cb(m || "wall", at - t / 2, gp[0], t, gp[1] - gp[0], base + 2.1, H - 2.1); cb("woodDark", at, gp[0], 0.9, 0.05, base, 2.05); } else { cb(m || "wall", gp[0], at - t / 2, gp[1] - gp[0], t, base + 2.1, H - 2.1); cb("woodDark", gp[0], at, 0.05, 0.9, base, 2.05); } } cur = Math.max(cur, gp[1]); });
    }
    function chair(m, u, v, base, du, dv) { cb(m, u - 0.21, v - 0.21, 0.42, 0.42, base + 0.42, 0.05); if (du) cb(m, u - du * 0.21 - 0.025, v - 0.21, 0.05, 0.42, base + 0.47, 0.42); else cb(m, u - 0.21, v - dv * 0.21 - 0.025, 0.42, 0.05, base + 0.47, 0.42); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { cb("dark", u + q[0] * 0.18 - 0.015, v + q[1] * 0.18 - 0.015, 0.03, 0.03, base, 0.42); }); }
    function tableSet(u, v, base, fab, top, diners, pendant) {
      cb(top, u - 0.45, v - 0.45, 0.9, 0.9, base + 0.72, 0.04); cb("steel", u - 0.04, v - 0.04, 0.08, 0.08, base, 0.72); cb("dark", u - 0.25, v - 0.25, 0.5, 0.5, base, 0.02);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (q, n) { var pu = u + q[0] * 0.7, pv = v + q[1] * 0.7; chair(fab, pu, pv, base, -q[0], -q[1]); cb("stone", u + q[0] * 0.27 - 0.12, v + q[1] * 0.27 - 0.12, 0.24, 0.24, base + 0.76, 0.015); cb("botC", u + q[0] * 0.2 + q[1] * 0.2 - 0.03, v + q[1] * 0.2 - q[0] * 0.2 - 0.03, 0.06, 0.06, base + 0.76, 0.12);
        if (n < diners) person(C.x + pu, C.y + pv, base - 0.02, q[0] ? -q[0] * Math.PI / 2 : (q[1] > 0 ? Math.PI : 0), "sit"); });
      if (pendant) { cb("dark", u - 0.008, v - 0.008, 0.016, 0.016, base + 2.3, H1 - 2.3); cb("lamp", u - 0.17, v - 0.17, 0.34, 0.34, base + 2.12, 0.2); }
    }
    function bench(u0, v0, len, base, alongU) { if (alongU) { cb("woodDark", u0, v0, len, 0.42, base + 0.42, 0.05); for (var q = 0.3; q < len; q += 1.4) cb("steel", u0 + q, v0 + 0.05, 0.05, 0.32, base, 0.42); cb("steel", u0, v0 + (v0 > 10 ? 0.38 : 0), len, 0.03, base + 1.7, 0.03); for (q = 0.25; q < len; q += 0.5) cb("chrome", u0 + q, v0 + (v0 > 10 ? 0.33 : 0.03), 0.03, 0.06, base + 1.64, 0.05); } else { cb("woodDark", u0, v0, 0.42, len, base + 0.42, 0.05); for (q = 0.3; q < len; q += 1.4) cb("steel", u0 + 0.05, v0 + q, 0.32, 0.05, base, 0.42); } }
    function plant(u, v, base, h) { cb("dark", u - 0.22, v - 0.22, 0.44, 0.44, base, 0.5); cb("plant", u - 0.3, v - 0.3, 0.6, 0.6, base + 0.5, h * 0.6); cb("plant", u - 0.2, v - 0.2, 0.4, 0.4, base + 0.5 + h * 0.6, h * 0.4); }

    /* --- enveloppe --- */
    cb("paving", 0, 0, C.w, C.d, PL, 0.02);
    [[0, 0, HOLE.u0, C.d], [HOLE.u1, 0, C.w - HOLE.u1, C.d], [HOLE.u0, 0, HOLE.u1 - HOLE.u0, HOLE.v0], [HOLE.u0, HOLE.v1, HOLE.u1 - HOLE.u0, C.d - HOLE.v1]].forEach(function (q) { cb("conc", q[0], q[1], q[2], q[3], PL + 3.6, 0.28); cb("parquet", q[0], q[1], q[2], q[3], PL + 3.88, 0.02); });
    cb("wood", -0.15, 0, 0.3, C.d, PL, 7.2); cb("wood", C.w - 0.15, 0, 0.3, C.d, PL, 7.2);
    // façade nord : vestiaires fermés, accueil et boutique vitrés, porte d'entrée ; étage entièrement vitré sur la terrasse
    cb("wood", 0, C.d - 0.15, 15, 0.3, PL, 3.6); cb("glass", 15, C.d - 0.05, 6, 0.1, PL, 3.6); cb("glass", 23.4, C.d - 0.05, C.w - 23.4, 0.1, PL, 3.6); cb("glass", 21, C.d - 0.05, 2.4, 0.1, PL + 2.3, 1.3);
    cb("dark", 21, C.d - 0.1, 0.08, 0.2, PL, 2.3); cb("dark", 23.32, C.d - 0.1, 0.08, 0.2, PL, 2.3); cb("dark", 21, C.d - 0.1, 2.4, 0.2, PL + 2.3, 0.08); cb("glass", 21.08, C.d + 0.05, 0.05, 1.1, PL, 2.3); cb("glass", 23.27, C.d + 0.05, 0.05, 1.1, PL, 2.3);
    cb("glass", 0, C.d - 0.05, C.w, 0.1, PL + 3.9, 3.3);
    // façade sud : locaux fermés aux deux bouts, bandeau vitré au centre
    cb("wood", 0, -0.15, 15, 0.3, PL, 3.6); cb("wood", 32, -0.15, 12, 0.3, PL, 7.2); cb("wood", 15, -0.15, 17, 0.3, PL, 1.1); cb("glass", 15, -0.05, 17, 0.1, PL + 1.1, 2.5);
    cb("wood", 0, -0.15, 32, 0.3, PL + 3.9, 1.0); cb("glass", 0, -0.05, 32, 0.1, PL + 4.9, 2.3);
    for (i = 0; i <= 8; i++) { cb("glulam", i * C.w / 8 - 0.11, C.d - 0.05, 0.22, 0.3, PL, 7.2); cb("glulam", i * C.w / 8 - 0.11, -0.25, 0.22, 0.3, PL, 7.2); }

    /* --- rez-de-chaussée --- */
    wall("u", 15, 0.15, C.d - 0.15, F0, H0, [[4.6, 5.5], [13.6, 14.5]]);            // vestiaires | couloir et accueil
    wall("v", 10, 0.15, 15, F0, H0);                                                 // entre les deux vestiaires
    wall("v", 8, 17.2, 44, F0, H0, [[19, 19.9], [23, 23.9], [27.6, 28.5], [36, 36.9]]); // sanitaires, réserve, bureau
    wall("u", 17.2, 0.15, 8, F0, H0); wall("u", 21.6, 0.15, 8, F0, H0); wall("u", 26, 0.15, 8, F0, H0); wall("u", 32, 0.15, 8, F0, H0);
    [[0, "fabA"], [10, "fabB"]].forEach(function (vs, n) { // deux vestiaires : douches, lavabos, casiers, bancs
      var v0 = vs[0] + 0.25, v1 = vs[0] + 9.85;
      cb("tileD", 0.2, v0, 4.6, v1 - v0, F0, 0.015); cb("tileW", 0.16, v0, 0.04, v1 - v0, F0, 2.2); wall("u", 4.8, v0, v1, F0, 2.3, [[vs[0] + 4.4, vs[0] + 5.6]], "tileW");
      for (k = 0; k < 4; k++) { var sv = v0 + 0.2 + k * 2.3; if (k) cb("tileW", 0.2, sv - 0.15, 1.5, 0.06, F0, 2.0); cb("chrome", 0.25, sv + 0.95, 0.04, 0.04, F0 + 1.1, 1.0); cb("chrome", 0.25, sv + 0.9, 0.28, 0.14, F0 + 2.08, 0.03); cb("chrome", 0.22, sv + 0.93, 0.05, 0.08, F0 + 1.1, 0.08); }
      cb("stone", 4.95, vs[0] + 0.6, 0.5, 3.4, F0 + 0.82, 0.06); cb("wall", 5.0, vs[0] + 0.6, 0.4, 3.4, F0, 0.82); cb("mirror", 4.9, vs[0] + 0.7, 0.02, 3.2, F0 + 1.1, 0.9); for (k = 0; k < 4; k++) cb("chrome", 5.0, vs[0] + 0.95 + k * 0.85, 0.05, 0.05, F0 + 0.88, 0.18);
      cb("stone", 4.95, vs[0] + 6.0, 0.5, 3.4, F0 + 0.82, 0.06); cb("wall", 5.0, vs[0] + 6.0, 0.4, 3.4, F0, 0.82); cb("mirror", 4.9, vs[0] + 6.1, 0.02, 3.2, F0 + 1.1, 0.9);
      for (k = 0; k < 16; k++) { var lu = 6.6 + k * 0.42; cb(k % 3 ? "lockA" : "lockB", lu, vs[0] + 4.55, 0.4, 0.45, F0 + 0.08, 1.85); cb(k % 3 === 1 ? "lockB" : "lockA", lu, vs[0] + 5.0, 0.4, 0.45, F0 + 0.08, 1.85); cb("chrome", lu + 0.3, vs[0] + 4.53, 0.03, 0.02, F0 + 1.0, 0.12); cb("chrome", lu + 0.3, vs[0] + 5.45, 0.03, 0.02, F0 + 1.0, 0.12); }
      bench(6.2, vs[0] + 0.3, 8.4, F0, true); bench(6.2, vs[0] + 9.3, 8.4, F0, true); bench(8, vs[0] + 2.4, 5, F0, true); bench(8, vs[0] + 7.2, 5, F0, true);
      cb(vs[1], 9, vs[0] + 0.32, 0.5, 0.3, F0 + 0.47, 0.28); cb("ball", 11.2, vs[0] + 2.45, 0.34, 0.3, F0 + 0.47, 0.26); cb("blue", 9.4, vs[0] + 7.25, 0.6, 0.3, F0 + 0.47, 0.3); cb("fabD", 12.3, vs[0] + 9.33, 0.5, 0.32, F0 + 0.47, 0.25);
      cb("lamp", 5.5, vs[0] + 4.9, 9, 0.12, F0 + H0 - 0.06, 0.04);
    });
    person(C.x + 10.5, C.y + 3.2, F0, 1.2, "stand"); person(C.x + 11.5, C.y + 17.42, F0, 3.14, "sit"); person(C.x + 7.6, C.y + 13, F0, 0.4, "stand");
    for (k = 0; k < 2; k++) { var wu = 17.3 + k * 4.4; for (i = 0; i < 2; i++) { cb("wall", wu + 0.2 + i * 1.3, 0.3, 0.05, 1.7, F0 + 0.15, 1.9); cb("stone", wu + 0.6 + i * 1.3, 0.5, 0.4, 0.6, F0, 0.42); cb("stone", wu + 0.6 + i * 1.3, 0.35, 0.4, 0.18, F0 + 0.42, 0.4); } cb("stone", wu + 0.4, 7.3, 2.6, 0.5, F0 + 0.82, 0.06); cb("mirror", wu + 0.5, 7.9, 2.4, 0.02, F0 + 1.1, 0.8); }
    for (k = 0; k < 4; k++) { cb("steel", 26.3, 0.5 + k * 1.7, 0.6, 1.5, F0, 2.2); cb("steel", 31.2, 0.5 + k * 1.7, 0.6, 1.5, F0, 2.2); } cb("ball", 26.4, 0.7, 0.4, 0.5, F0 + 2.2, 0.35); cb("fabD", 31.3, 2.6, 0.4, 0.9, F0 + 2.2, 0.3);
    // accueil : comptoir, salon d'attente, vitrine des trophées, escalier
    cb("wood", 17.6, 10.2, 4.6, 0.7, F0, 1.05); cb("stone", 17.5, 10.1, 4.8, 0.9, F0 + 1.05, 0.05); cb("wood", 17.6, 8.6, 0.7, 1.6, F0, 1.05); cb("stone", 17.5, 8.5, 0.9, 1.7, F0 + 1.05, 0.05);
    cb("dark", 19.2, 10.35, 0.5, 0.04, F0 + 1.12, 0.34); cb("screen", 19.22, 10.39, 0.46, 0.01, F0 + 1.14, 0.3); cb("dark", 20.6, 10.4, 0.3, 0.2, F0 + 1.1, 0.03); cb("ball", 21.6, 10.5, 0.14, 0.14, F0 + 1.1, 0.22);
    cb("fabA", 17.3, 8.08, 8.6, 0.04, F0 + 1.5, 1.2); cb("lamp", 18.2, 8.13, 3.2, 0.02, F0 + 1.95, 0.34); cb("wood", 22.3, 8.1, 3.2, 0.3, F0 + 1.3, 0.04); cb("wood", 22.3, 8.1, 3.2, 0.3, F0 + 1.8, 0.04); for (k = 0; k < 5; k++) { cb("gold", 22.5 + k * 0.6, 8.16, 0.16, 0.16, F0 + 1.34, 0.3 + (k % 2) * 0.1); cb("gold", 22.6 + k * 0.6, 8.16, 0.2, 0.16, F0 + 1.84, 0.22); }
    person(C.x + 19.6, C.y + 9.3, F0, 0, "staff"); person(C.x + 19.4, C.y + 11.9, F0, 3.14, "stand"); person(C.x + 20.6, C.y + 12.1, F0, 3.0, "stand");
    cb("rug", 16, 15.4, 5.6, 4, F0, 0.012); cb("fabC", 16.2, 15.6, 0.9, 3.4, F0, 0.42); cb("fabC", 16.2, 15.6, 0.25, 3.4, F0 + 0.42, 0.42); cb("fabD", 17.6, 18.6, 3.2, 0.9, F0, 0.42); cb("fabD", 17.6, 19.25, 3.2, 0.25, F0 + 0.42, 0.42); cb("wood", 18.2, 16.6, 1.6, 0.9, F0 + 0.32, 0.05); cb("dark", 18.3, 16.7, 0.06, 0.7, F0, 0.32); cb("dark", 19.64, 16.7, 0.06, 0.7, F0, 0.32); cb("ball", 18.7, 16.9, 0.3, 0.22, F0 + 0.37, 0.03);
    person(C.x + 16.8, C.y + 16.6, F0, 1.57, "sit"); person(C.x + 18.6, C.y + 18.9, F0, 3.14, "sit");
    plant(15.6, 19.2, F0, 1.5); plant(24.4, 19.2, F0, 1.3); plant(31.2, 8.6, F0, 1.6); plant(27.6, 19.2, F0, 1.2);
    cb("glass", 15.2, 11.2, 0.5, 3, F0 + 0.9, 1.3); cb("woodDark", 15.2, 11.2, 0.5, 3, F0, 0.9); for (k = 0; k < 4; k++) cb("gold", 15.35, 11.5 + k * 0.7, 0.2, 0.2, F0 + 0.95, 0.38 + (k % 2) * 0.14);
    var NS = 22, rise = 3.9 / NS, tread = 6.4 / NS, ang = Math.atan2(3.9, 6.4), slen = Math.sqrt(3.9 * 3.9 + 6.4 * 6.4);
    for (k = 0; k < NS; k++) { cb("wall", 28.8, 9.8 + k * tread, 1.8, tread, PL, (k + 1) * rise - 0.04); cb("wood", 28.78, 9.78 + k * tread, 1.84, tread + 0.03, PL + (k + 1) * rise - 0.04, 0.04); }
    [28.72, 30.66].forEach(function (u) { ib("glass", 0.03, 1.0, slen, cu(u), PL + 1.95 + 0.62, cv(13), 0, ang); ib("chrome", 0.05, 0.05, slen, cu(u), PL + 1.95 + 1.14, cv(13), 0, ang); });
    cb("glass", HOLE.u0 - 0.02, HOLE.v0, 0.03, HOLE.v1 - HOLE.v0, F1, 1.05); cb("glass", HOLE.u1, HOLE.v0, 0.03, HOLE.v1 - HOLE.v0, F1, 1.05); cb("glass", HOLE.u0, HOLE.v0 - 0.02, HOLE.u1 - HOLE.u0, 0.03, F1, 1.05); cb("chrome", HOLE.u0 - 0.03, HOLE.v0, 0.05, HOLE.v1 - HOLE.v0, F1 + 1.05, 0.05); cb("chrome", HOLE.u1 - 0.01, HOLE.v0, 0.05, HOLE.v1 - HOLE.v0, F1 + 1.05, 0.05);
    person(C.x + 29.7, C.y + 12.4, PL + (12.4 - 9.8) / 6.4 * 3.9, 0, "walk");
    // boutique : rayonnages, raquettes, portants, caisse
    for (k = 0; k < 4; k++) { cb("wood", 43.3, 9, 0.5, 10, F0 + 0.4 + k * 0.5, 0.04); for (i = 0; i < 12; i++) cb(["ball", "red", "blue", "stone", "fabA"][(i + k) % 5], 43.4, 9.3 + i * 0.8, 0.3, 0.5, F0 + 0.44 + k * 0.5, 0.2 + ((i * 7 + k) % 3) * 0.06); } cb("woodDark", 43.75, 9, 0.1, 10, F0, 2.4);
    for (k = 0; k < 10; k++) { var ru = 37.4 + k * 0.62, rc = ["red", "blue", "ball", "dark", "fabA"][k % 5]; cb(rc, ru, 8.1, 0.27, 0.03, F0 + 1.55, 0.36); cb("stone", ru + 0.03, 8.105, 0.21, 0.025, F0 + 1.58, 0.3); cb("dark", ru + 0.115, 8.1, 0.04, 0.03, F0 + 1.2, 0.35); }
    [[35, 12.5], [38.5, 14.5], [35, 16.5]].forEach(function (q, n) { cb("chrome", q[0], q[1], 2.2, 0.03, F0 + 1.5, 0.03); cb("chrome", q[0], q[1], 0.03, 0.03, F0, 1.5); cb("chrome", q[0] + 2.17, q[1], 0.03, 0.03, F0, 1.5); for (i = 0; i < 9; i++) cb(["stone", "fabA", "red", "blue", "ball", "dark"][(i + n * 2) % 6], q[0] + 0.15 + i * 0.22, q[1] - 0.2, 0.05, 0.42, F0 + 0.78, 0.7); });
    cb("wood", 33, 18, 3, 0.7, F0, 1.0); cb("stone", 32.9, 17.9, 3.2, 0.9, F0 + 1.0, 0.05); cb("dark", 34.2, 18.2, 0.4, 0.3, F0 + 1.05, 0.25); person(C.x + 34.4, C.y + 19.2, F0, 3.14, "stand"); person(C.x + 39.6, C.y + 13.4, F0, 0.6, "stand");
    for (k = 0; k < 2; k++) { cb("wood", 34 + k * 5, 2.5, 1.6, 0.8, F0 + 0.72, 0.04); cb("dark", 34.05 + k * 5, 2.55, 0.05, 0.7, F0, 0.72); cb("dark", 35.5 + k * 5, 2.55, 0.05, 0.7, F0, 0.72); cb("dark", 34.5 + k * 5, 3.0, 0.5, 0.04, F0 + 0.78, 0.34); chair("fabD", 34.8 + k * 5, 1.9, F0, 0, 1); } cb("wood", 43.4, 0.4, 0.4, 7.2, F0, 2.2);

    /* --- étage : restaurant, bar, cuisine, salon --- */
    wall("v", 8, 32, 33.2, F1, H1); cb("wall", 33.2, 7.93, 8, 0.14, F1, 0.95); cb("wall", 33.2, 7.93, 8, 0.14, F1 + 2.1, H1 - 2.1); wall("v", 8, 41.2, 43.85, F1, H1); wall("u", 32, 0.15, 8, F1, H1, [[5.6, 6.5]]);
    cb("tileD", 32.1, 0.2, 11.7, 7.7, F1, 0.015); cb("chrome", 32.3, 0.3, 11.4, 0.8, F1, 0.9); cb("chrome", 43, 1.1, 0.8, 6.6, F1, 0.9); cb("chrome", 35, 3.6, 5.5, 1.2, F1, 0.9); cb("dark", 36, 3.7, 2.4, 1.0, F1 + 0.9, 0.03); cb("chrome", 35.6, 3.4, 3.2, 1.6, F1 + 2.0, 0.6); cb("chrome", 32.3, 6.6, 0.8, 1.2, F1, 2.0); cb("chrome", 33.4, 7.2, 7.6, 0.6, F1 + 0.95, 0.04);
    for (k = 0; k < 5; k++) { cb("stone", 34 + k * 1.4, 7.3, 0.26, 0.26, F1 + 0.99, 0.02); cb("chrome", 33 + k * 2, 0.5, 0.4, 0.4, F1 + 0.9, 0.25); } person(C.x + 37.6, C.y + 5.6, F1, 0.2, "staff");
    wall("v", 6.4, 17.2, 26, F1, H1, [[19, 19.9], [23, 23.9]]); wall("u", 17.2, 0.15, 6.4, F1, H1); wall("u", 26, 0.15, 6.4, F1, H1); wall("u", 21.6, 0.15, 6.4, F1, H1);
    cb("woodDark", 33.2, 10.4, 8, 0.75, F1, 1.08); cb("stone", 33.05, 10.3, 8.3, 0.95, F1 + 1.08, 0.05); cb("woodDark", 33.2, 8.1, 8, 0.4, F1, 0.92);
    for (k = 0; k < 3; k++) { cb("wood", 41.3, 8.1, 2.4, 0.3, F1 + 1.2 + k * 0.5, 0.03); for (i = 0; i < 9; i++) cb(["botG", "botA", "botC"][(i + k) % 3], 41.42 + i * 0.25, 8.16, 0.08, 0.08, F1 + 1.23 + k * 0.5, 0.26 + (i % 2) * 0.05); }
    for (i = 0; i < 9; i++) cb(["botA", "botG", "botC"][i % 3], 33.5 + i * 0.3, 8.2, 0.08, 0.08, F1 + 0.92, 0.28); cb("chrome", 38.2, 8.15, 0.7, 0.36, F1 + 0.92, 0.45); for (i = 0; i < 4; i++) cb("chrome", 35 + i * 0.22, 10.7, 0.05, 0.05, F1 + 1.13, 0.3);
    for (k = 0; k < 7; k++) { var su = 33.8 + k * 1.1; cb("fabB", su - 0.18, 11.55, 0.36, 0.36, F1 + 0.74, 0.06); cb("chrome", su - 0.02, 11.71, 0.04, 0.04, F1, 0.74); cb("chrome", su - 0.16, 11.57, 0.32, 0.32, F1, 0.02); if (k < 6) { cb("dark", su + 0.3, 10.75, 0.012, 0.012, F1 + 2.35, H1 - 2.35); cb("lamp", su + 0.2, 10.65, 0.22, 0.22, F1 + 2.15, 0.22); } }
    person(C.x + 36.2, C.y + 9.5, F1, 0, "staff"); person(C.x + 35, C.y + 12.3, F1, 3.14, "stand"); person(C.x + 38.4, C.y + 12.4, F1, 2.9, "stand");
    var fabs = ["fabA", "fabB", "fabC", "fabD"], nT = 0;
    [10.6, 14, 17.5].forEach(function (v, r) { for (var u = 3; u <= 27; u += 4) { tableSet(u, v, F1, fabs[(nT + r) % 4], "wood", [2, 4, 0, 3, 2, 0, 4, 1][nT % 8], true); nT++; } });
    [[34.5, 14.6], [38.5, 14.6], [42, 14.6], [34.5, 17.8], [38.5, 17.8], [42, 17.8]].forEach(function (q, n) { tableSet(q[0], q[1], F1, fabs[n % 4], "wood", [0, 2, 4, 3, 0, 2][n], true); });
    [[11.5, 2.6], [15, 2.6], [11.5, 6], [15, 6], [28.5, 3.2], [28.5, 6.8]].forEach(function (q, n) { tableSet(q[0], q[1], F1, fabs[(n + 1) % 4], "wood", [2, 0, 3, 2, 2, 0][n], true); });
    cb("rug", 1, 0.8, 7.6, 6.4, F1, 0.012); cb("fabA", 1.2, 1, 0.95, 4.4, F1, 0.42); cb("fabA", 1.2, 1, 0.26, 4.4, F1 + 0.42, 0.44); cb("fabA", 2.4, 6.1, 3.6, 0.95, F1, 0.42); cb("fabA", 2.4, 6.8, 3.6, 0.26, F1 + 0.42, 0.44); cb("fabD", 6.6, 1.4, 0.9, 0.9, F1, 0.42); cb("fabD", 7.25, 1.4, 0.25, 0.9, F1 + 0.42, 0.4); cb("fabD", 6.6, 3.6, 0.9, 0.9, F1, 0.42); cb("fabD", 7.25, 3.6, 0.25, 0.9, F1 + 0.42, 0.4);
    cb("wood", 3.4, 2.4, 2, 1.2, F1 + 0.34, 0.05); cb("dark", 3.5, 2.5, 0.06, 1, F1, 0.34); cb("dark", 5.24, 2.5, 0.06, 1, F1, 0.34); cb("ball", 4.1, 2.8, 0.2, 0.2, F1 + 0.39, 0.07); for (k = 0; k < 4; k++) { cb("wood", 0.2, 0.6, 0.35, 6.4, F1 + 0.5 + k * 0.5, 0.03); for (i = 0; i < 14; i++) cb(["red", "blue", "fabD", "stone", "fabA"][(i * 3 + k) % 5], 0.24, 0.8 + i * 0.42, 0.24, 0.3, F1 + 0.53 + k * 0.5, 0.3); }
    person(C.x + 1.7, C.y + 2.6, F1, 1.57, "sit"); person(C.x + 3.8, C.y + 6.5, F1, 3.14, "sit"); plant(9, 0.7, F1, 1.6); plant(0.8, 19.2, F1, 1.4); plant(31.4, 19.2, F1, 1.4); plant(16.4, 0.7, F1, 1.2); plant(43.2, 19.2, F1, 1.3);
    person(C.x + 20, C.y + 12.3, F1, 1.4, "staff"); person(C.x + 24.4, C.y + 8.4, F1, 2.2, "walk");

    /* --- terrasse au nord, face aux courts --- */
    var ter = { x: C.x, y: C.y + C.d, w: C.w, d: 6 }; slab(g, ter, 0.3, M.conc, PL + 3.6); cb("woodDark", 0, C.d, C.w, 6, PL + 3.9, 0.02);
    cb("glass", 0, C.d + 5.95, C.w, 0.05, PL + 3.92, 1.05); cb("chrome", 0, C.d + 5.93, C.w, 0.08, PL + 4.97, 0.05); cb("glass", -0.02, C.d, 0.05, 6, PL + 3.92, 1.05); cb("glass", C.w - 0.03, C.d, 0.05, 6, PL + 3.92, 1.05);
    for (i = 0; i <= 8; i++) cb("steel", i * C.w / 8 - 0.1, C.d + 5.8, 0.2, 0.2, PL, 3.6);
    for (i = 0; i < 8; i++) { var tu = 3.4 + i * 5.3; tableSet(tu, C.d + 3.1, PL + 3.92, fabs[i % 4], "wood", [3, 2, 0, 4, 2, 0, 3, 2][i], false); if (i % 2 === 0) { cb("steel", tu + 1.3, C.d + 4.2, 0.06, 0.06, PL + 3.92, 2.5); var par = new T.Mesh(new T.ConeGeometry(2.1, 0.55, 8), M.white); par.position.set(cu(tu + 1.33), PL + 6.6, cv(C.d + 4.23)); par.castShadow = true; g.add(par); } }
    for (i = 0; i < 6; i++) { cb("woodDark", 1 + i * 8, C.d + 5.3, 2.4, 0.5, PL + 3.92, 0.5); cb("plant", 1.05 + i * 8, C.d + 5.33, 2.3, 0.44, PL + 4.42, 0.45); }
    person(C.x + 14, C.y + C.d + 1.2, PL + 3.92, 0.4, "staff"); person(C.x + 30.5, C.y + C.d + 5.2, PL + 3.92, 0.1, "stand");
    /* --- parvis : auvent d'entrée, bancs, bacs plantés, arceaux à vélos --- */
    cb("fabA", 20.6, C.d + 0.3, 3.2, 2.2, PL, 0.015);
    for (i = 0; i < 4; i++) { var bu = 4 + i * 11; cb("woodDark", bu, C.d + 9, 2.2, 0.5, 0.4, 0.06); cb("conc", bu + 0.1, C.d + 9.05, 0.3, 0.4, 0, 0.4); cb("conc", bu + 1.8, C.d + 9.05, 0.3, 0.4, 0, 0.4); }
    for (i = 0; i < 8; i++) { var au = 30 + i * 0.9; cb("chrome", au, C.d + 8.4, 0.04, 0.04, PL, 0.85); cb("chrome", au, C.d + 9.2, 0.04, 0.04, PL, 0.85); cb("chrome", au, C.d + 8.4, 0.04, 0.84, PL + 0.85, 0.04); }
    var pl1 = new T.PointLight(0xffe6c0, 0.55, 26, 1.6); pl1.position.set(cu(14), F1 + 2.7, cv(12)); g.add(pl1); var pl2 = new T.PointLight(0xffe6c0, 0.5, 22, 1.6); pl2.position.set(cu(36), F1 + 2.7, cv(11)); g.add(pl2);
    var pl3 = new T.PointLight(0xfff1dc, 0.55, 22, 1.6); pl3.position.set(cu(23), F0 + 3, cv(14)); g.add(pl3); var pl4 = new T.PointLight(0xfff1dc, 0.4, 16, 1.6); pl4.position.set(cu(8), F0 + 3, cv(10)); g.add(pl4);
  }
  /* ---------- arbres instanciés ---------- */
  function trees(g, list) {
    var ico = new T.IcosahedronGeometry(1, 1), p = ico.attributes.position, i;
    for (i = 0; i < p.count; i++) { var a = p.getX(i), b = p.getY(i), c = p.getZ(i), h = Math.sin(a * 12.9 + b * 78.2 + c * 37.7) * 43758.5; h = h - Math.floor(h); var k = 0.82 + h * 0.36; p.setXYZ(i, a * k, b * k, c * k); }
    var nn0 = ico.attributes.normal; for (i = 0; i < p.count; i++) { var l0 = Math.sqrt(p.getX(i) * p.getX(i) + p.getY(i) * p.getY(i) + p.getZ(i) * p.getZ(i)) || 1; nn0.setXYZ(i, p.getX(i) / l0, p.getY(i) / l0, p.getZ(i) / l0); }
    var n = list.length, crowns = new T.InstancedMesh(ico, M.leaf, n * 3), trunks = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.26, 1, 6), M.trunk, n), o = new T.Object3D(), col = new T.Color(), pal = [0x2f4d29, 0x3a5c30, 0x466b38, 0x29452a, 0x527540, 0x3f6234];
    list.forEach(function (t, j) {
      var s = t[2] * 0.85, x = X(t[0]), z = Z(t[1]), th = 2.2 * s + 1;
      o.position.set(x, th / 2, z); o.scale.set(s, th, s); o.rotation.set(0, 0, 0); o.updateMatrix(); trunks.setMatrixAt(j, o.matrix);
      for (var q = 0; q < 3; q++) { var r = (2.1 + rnd() * 1.2) * s * (q ? 0.78 : 1); o.position.set(x + (q ? (rnd() - 0.5) * 2.6 * s : 0), th + r * 0.7 + (q ? rnd() * 1.4 * s : 0.3), z + (q ? (rnd() - 0.5) * 2.6 * s : 0)); o.scale.set(r, r * (0.85 + rnd() * 0.3), r); o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); o.updateMatrix(); crowns.setMatrixAt(j * 3 + q, o.matrix); col.setHex(pal[Math.floor(rnd() * pal.length)]); col.multiplyScalar(0.85 + rnd() * 0.3); crowns.setColorAt(j * 3 + q, col); }
    });
    crowns.castShadow = true; crowns.receiveShadow = true; trunks.castShadow = true; g.add(crowns); g.add(trunks);
  }
  /* ---------- mobilier : boîtes instanciées par matériau ---------- */
  var BATCH = {};
  function ib(m, w, h, d, x, y, z, ry, rx) { (BATCH[m] || (BATCH[m] = [])).push([w, h, d, x, y, z, ry || 0, rx || 0]); }
  function flush(g) {
    BOX = BOX || new T.BoxGeometry(1, 1, 1); var o = new T.Object3D();
    Object.keys(BATCH).forEach(function (k) { var a = BATCH[k], im = new T.InstancedMesh(BOX, M[k], a.length); a.forEach(function (b, i) { o.position.set(b[3], b[4], b[5]); o.scale.set(b[0], b[1], b[2]); o.rotation.set(b[7], b[6], 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); im.frustumCulled = false; im.castShadow = !M[k].transparent && M[k].type !== "MeshBasicMaterial"; im.receiveShadow = true; if (M[k].transparent) ghosts.push(im); g.add(im); });
    BATCH = {};
  }
  /* ---------- voitures : carrosseries profilées, instanciées par modèle ---------- */
  function loft(st, ring) { // sections successives le long de X, reliées en peau lisse
    var pos = [], idx = [], n = 0, K = 0;
    st.forEach(function (q) { var r = ring(q); K = r.length; r.forEach(function (p) { pos.push(q[0], p[1], p[0]); }); n++; });
    for (var i = 0; i < n - 1; i++) for (var k = 0; k < K; k++) { var a = i * K + k, b = i * K + (k + 1) % K, c = a + K, d = b + K; idx.push(a, c, b, b, c, d); }
    [0, n - 1].forEach(function (e, f) { var cx = 0, cy = 0; for (var k = 0; k < K; k++) { cx += pos[(e * K + k) * 3 + 2] / K; cy += pos[(e * K + k) * 3 + 1] / K; } var ci = pos.length / 3; pos.push(st[e][0], cy, cx); for (k = 0; k < K; k++) { var a = e * K + k, b = e * K + (k + 1) % K; if (f) idx.push(b, a, ci); else idx.push(a, b, ci); } });
    var ge = new T.BufferGeometry(); ge.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); ge.setIndex(idx); ge.computeVertexNormals(); return ge.toNonIndexed();
  }
  function merge(parts) { // [géométrie, matrice, couleur]
    var pos = [], nor = [], col = [], v = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
    parts.forEach(function (p) { var ge = p[0].index ? p[0].toNonIndexed() : p[0], P = ge.attributes.position, N = ge.attributes.normal; if (p[1]) nm.getNormalMatrix(p[1]); c.set(p[2] === undefined ? 0xffffff : p[2]);
      for (var i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); if (p[1]) v.applyMatrix4(p[1]); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(N, i); if (p[1]) v.applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); } });
    var out = new T.BufferGeometry(); out.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3)); out.setAttribute("color", new T.Float32BufferAttribute(col, 3)); return out;
  }
  var CARS = [], STYLES = null;
  function carStyles() {
    function body(q) { var hw = q[1], y0 = q[2], y1 = q[3], r = 0.09; return [[-hw + r, y0], [hw - r, y0], [hw, y0 + r], [hw, y1 - r * 1.4], [hw - r * 1.6, y1], [-hw + r * 1.6, y1], [-hw, y1 - r * 1.4], [-hw, y0 + r]]; }
    function glass(q) { var hb = q[1], ht = q[2], yb = q[3], yt = q[4]; return [[-hb, yb], [hb, yb], [ht, yt - 0.05], [ht - 0.07, yt], [-ht + 0.07, yt], [-ht, yt - 0.05]]; }
    function mk(o) {
      var m4 = new T.Matrix4(), q = new T.Quaternion(), parts = [], e = new T.Euler(Math.PI / 2, 0, 0), L = o.L / 2, hw = o.hw, wr = o.wr;
      function put(ge, x, y, z, sx, sy, sz, c, rot) { m4.compose(new T.Vector3(x, y, z), rot ? q.setFromEuler(e) : q.set(0, 0, 0, 1), new T.Vector3(sx, sy, sz)); parts.push([ge, m4.clone(), c]); }
      var cyl = new T.CylinderGeometry(1, 1, 1, 16), bx = new T.BoxGeometry(1, 1, 1);
      [-o.wx, o.wx].forEach(function (x) { [-1, 1].forEach(function (sd) { put(cyl, x, wr, sd * (hw - 0.1), wr, 0.22, wr, 0x141517, true); put(cyl, x, wr, sd * (hw - 0.085), wr * 0.62, 0.2, wr * 0.62, 0xb4b8be, true); put(cyl, x, wr, sd * (hw - 0.075), wr * 0.2, 0.19, wr * 0.2, 0x3a3d42, true); put(cyl, x, wr + 0.02, sd * (hw - 0.012), wr + 0.07, 0.03, wr + 0.07, 0x0d0e10, true); }); });
      [-1, 1].forEach(function (sd) { put(bx, L - 0.05, o.belt - 0.2, sd * (hw - 0.3), 0.1, 0.13, 0.36, 0xf6f4e8); put(bx, -L + 0.05, o.belt - 0.12, sd * (hw - 0.26), 0.1, 0.14, 0.3, 0xa3161b); put(bx, o.mx, o.belt + 0.04, sd * (hw + 0.07), 0.13, 0.1, 0.16, 0x1a1c20); });
      put(bx, L - 0.02, 0.5, 0, 0.06, 0.2, 1.0, 0x16181b); put(bx, L, 0.44, 0, 0.03, 0.11, 0.46, 0xf2f2ee); put(bx, -L, 0.6, 0, 0.03, 0.11, 0.46, 0xf2f2ee); put(bx, 0, 0.27, 0, o.L * 0.82, 0.14, hw * 1.7, 0x101113);
      var pp = [[loft(o.body, body)], [loft(o.roof, body)]];
      o.pil.forEach(function (p) { [-1, 1].forEach(function (sd) { m4.compose(new T.Vector3(p[0], (o.gy[0] + o.gy[1]) / 2, sd * o.ph), q.set(0, 0, 0, 1), new T.Vector3(p[1], o.gy[1] - o.gy[0], 0.07)); pp.push([bx, m4.clone()]); }); });
      var paint = merge(pp);
      return { paint: paint, glass: merge([[loft(o.glass, glass)]]), trim: merge(parts) };
    }
    return [
      mk({ pil: [[-0.35, 0.1], [-1.5, 0.3], [0.62, 0.07]], gy: [0.93, 1.42], ph: 0.775, L: 4.18, hw: 0.89, wr: 0.31, wx: 1.28, belt: 0.97, mx: 0.78, body: [[-2.08, 0.7, 0.45, 0.86], [-2.0, 0.84, 0.32, 0.98], [-1.3, 0.89, 0.24, 1.0], [0, 0.89, 0.22, 0.97], [1.0, 0.89, 0.24, 0.93], [1.7, 0.86, 0.28, 0.82], [2.02, 0.8, 0.34, 0.72], [2.1, 0.66, 0.42, 0.62]], glass: [[-2.0, 0.8, 0.74, 0.92, 0.99], [-1.62, 0.82, 0.7, 0.92, 1.4], [-0.3, 0.84, 0.72, 0.9, 1.45], [0.4, 0.84, 0.71, 0.9, 1.42], [1.2, 0.82, 0.76, 0.9, 0.95]], roof: [[-1.66, 0.69, 1.385, 1.415], [-0.3, 0.72, 1.44, 1.47], [0.44, 0.71, 1.41, 1.44]] }),
      mk({ pil: [[-0.35, 0.1], [-1.62, 0.5], [0.72, 0.07]], gy: [1.05, 1.62], ph: 0.825, L: 4.5, hw: 0.93, wr: 0.36, wx: 1.36, belt: 1.1, mx: 0.85, body: [[-2.22, 0.74, 0.5, 0.98], [-2.15, 0.88, 0.4, 1.12], [-1.3, 0.93, 0.3, 1.14], [0, 0.93, 0.28, 1.1], [1.1, 0.93, 0.3, 1.06], [1.85, 0.9, 0.34, 0.98], [2.17, 0.84, 0.4, 0.86], [2.25, 0.7, 0.48, 0.74]], glass: [[-2.14, 0.84, 0.78, 1.05, 1.12], [-1.9, 0.86, 0.76, 1.05, 1.6], [-0.3, 0.88, 0.77, 1.03, 1.66], [0.5, 0.88, 0.76, 1.03, 1.62], [1.3, 0.86, 0.8, 1.03, 1.08]], roof: [[-1.93, 0.75, 1.585, 1.62], [-0.3, 0.77, 1.65, 1.68], [0.54, 0.76, 1.61, 1.64]] }),
      mk({ pil: [[0.15, 0.12], [-1.25, 2.1]], gy: [1.1, 1.87], ph: 0.885, L: 4.84, hw: 0.95, wr: 0.35, wx: 1.5, belt: 1.13, mx: 1.25, body: [[-2.42, 0.8, 0.5, 1.0], [-2.38, 0.92, 0.38, 1.15], [-1, 0.95, 0.3, 1.15], [0.6, 0.95, 0.3, 1.12], [1.7, 0.93, 0.32, 1.05], [2.3, 0.88, 0.38, 0.92], [2.42, 0.76, 0.46, 0.8]], glass: [[-2.38, 0.9, 0.86, 1.1, 1.14], [-2.3, 0.9, 0.86, 1.1, 1.86], [0.2, 0.9, 0.86, 1.08, 1.9], [1.0, 0.9, 0.85, 1.08, 1.84], [1.95, 0.88, 0.84, 1.06, 1.1]], roof: [[-2.31, 0.85, 1.85, 1.88], [0.2, 0.85, 1.89, 1.92], [1.02, 0.84, 1.83, 1.86]] })
    ];
  }
  function car(g, x, y, rot, c, style) { var r = rnd(); CARS.push([X(x), Z(y), rot, c, style === undefined ? (r < 0.5 ? 0 : r < 0.86 ? 1 : 2) : style]); }
  function flushCars(g) {
    STYLES = STYLES || carStyles(); var o = new T.Object3D(), col = new T.Color();
    STYLES.forEach(function (st, k) { var list = CARS.filter(function (c) { return c[4] === k; }); if (!list.length) return;
      var a = new T.InstancedMesh(st.paint, M.carPaint, list.length), b = new T.InstancedMesh(st.glass, M.carGlass, list.length), t = new T.InstancedMesh(st.trim, M.carTrim, list.length);
      list.forEach(function (c, i) { o.position.set(c[0], 0, c[1]); o.rotation.set(0, c[2], 0); o.scale.set(1, 1, 1); o.updateMatrix(); a.setMatrixAt(i, o.matrix); b.setMatrixAt(i, o.matrix); t.setMatrixAt(i, o.matrix); a.setColorAt(i, col.setHex(c[3])); });
      [a, b, t].forEach(function (m) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; g.add(m); }); });
    CARS = [];
  }
  function label(g, text, x, y, h, existing) { // étiquette à taille constante à l'écran
    var c = document.createElement("canvas"), k = c.getContext("2d"), f = "500 30px 'IBM Plex Mono', monospace"; k.font = f; c.width = Math.ceil(k.measureText(text).width + 36); c.height = 56; k = c.getContext("2d");
    k.fillStyle = existing ? "#15181f" : "#ffffff"; k.fillRect(0, 0, c.width, c.height); if (!existing) { k.strokeStyle = "#15181f"; k.lineWidth = 3; k.strokeRect(1.5, 1.5, c.width - 3, c.height - 3); }
    k.font = f; k.fillStyle = existing ? "#ffffff" : "#15181f"; k.textAlign = "center"; k.textBaseline = "middle"; k.fillText(text, c.width / 2, 30);
    var tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; var sp = new T.Sprite(new T.SpriteMaterial({ map: tx, depthTest: false, transparent: true, sizeAttenuation: false })); sp.scale.set(0.03 * c.width / 56, 0.03, 1); sp.position.set(X(x), h, Z(y)); sp.renderOrder = 10; g.add(sp); labels.push(sp); ghosts.push(sp);
    var st = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(X(x), 0.2, Z(y)), new T.Vector3(X(x), h, Z(y))]), new T.LineBasicMaterial({ color: existing ? 0x15181f : 0xffffff })); g.add(st); labels.push(st); ghosts.push(st);
  }
  function person(x, y, h, yaw, kind) { spots.push({ x: x, y: y, h: h, yaw: yaw || 0, kind: kind || "stand" }); }

  function build() {
    var g = scene, i;
    /* sol : orthophoto, puis pelouse du campus au nord de l'aire de jeux existante */
    var far = new T.Mesh(new T.PlaneGeometry(6000, 6000), S({ color: 0x8fa08a, roughness: 1 })); far.rotation.x = -Math.PI / 2; far.position.y = -4; g.add(far);
    var ot = new T.TextureLoader().load("ortho.jpg"); ot.encoding = T.sRGBEncoding; ot.anisotropy = 8;
    var og = new T.Mesh(new T.PlaneGeometry(921.6, 691.2), S({ map: ot, roughness: 1, envMapIntensity: 0.4 })); og.rotation.x = -Math.PI / 2; og.position.set(X(180.8), 0, Z(250)); og.receiveShadow = true; g.add(og);
    var lawn = [[31.2, 122], [180.9, 122], [217.9, 189.7], [213, 242.5], [224.6, 268.5], [272.6, 380.5], [112.6, 436.1]], sh = new T.Shape();
    lawn.forEach(function (p, k) { if (k) sh.lineTo(X(p[0]), -Z(p[1])); else sh.moveTo(X(p[0]), -Z(p[1])); });
    var lw = new T.Mesh(new T.ShapeGeometry(sh), M.grass); lw.rotation.x = -Math.PI / 2; lw.position.y = 0.03; lw.receiveShadow = true; g.add(lw);
    var pts = D.poly.concat([D.poly[0]]).map(function (p) { return new T.Vector3(X(p[0]), 0.16, Z(p[1])); }); var ol = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xffffff })); g.add(ol); labels.push(ol);
    /* existant : piste cyclable, bâtiments voisins, ligne à haute tension */
    ribbon(g, D.cycle, 3.2, M.gravel, 0.05); ribbon(g, D.southPath, 3.2, M.gravel, 0.05);
    function ebox(x, y, w, d, h, rot, roofM) { var b = box(g, w, h, d, M.ctx, X(x), h / 2, Z(y)); b.rotation.y = rot || 0; var r = box(g, w + 0.8, 0.35, d + 0.8, roofM || M.ctxRoof, X(x), h + 0.17, Z(y)); r.rotation.y = rot || 0; return b; }
    ebox(262, 318, 46, 26, 9.5, -0.1); ebox(257, 283, 30, 40, 9.5, -0.35); ebox(276, 296, 22, 30, 7); // CIPA, aile voisine du site
    ebox(374, 269, 93, 18, 13, -0.52); [0.52, 2.62, 4.71].forEach(function (a) { ebox(364 + Math.cos(a) * 16, 325 + Math.sin(a) * 16, 38, 13, 13, a); });
    ebox(200, 473, 55, 40, 8, 0.1, S({ color: 0x6f8f62, roughness: 1 })); ebox(238, 450, 24, 48, 9, -0.15); ebox(279.5, 426, 55, 13, 10, 0.94); ebox(309.5, 411, 60, 14, 10, 0.94); // bâtiments au nord, rue de Mullendorf
    [[126.3, -31.1], [148.2, -33], [166.2, -43], [187.7, -51.4], [204.6, -64.1], [224.2, -75.3], [88.6, -63], [119.4, -66.8], [65.6, -53.4], [139.7, -80.2]].forEach(function (h) { var rot = -0.45 + rnd() * 0.2; box(g, 11, 5.6, 9, M.ctx, X(h[0]), 2.8, Z(h[1])).rotation.y = rot; var r = box(g, 8.4, 8.4, 11.3, M.tile, X(h[0]), 5.6, Z(h[1])); r.rotation.set(0, rot + Math.PI / 2, Math.PI / 4); r.scale.set(6.6, 6.6, 11.4); });
    D.pylons.forEach(function (p) { var px = X(p[0]), pz = Z(p[1]); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { var leg = box(g, 0.28, 31, 0.28, M.steel, px + q[0] * 1.9, 15.3, pz + q[1] * 1.9); leg.rotation.set(q[1] * 0.11, 0, -q[0] * 0.11); }); for (var k = 1; k < 8; k++) { var w = 6.6 - k * 0.72; box(g, w, 0.14, 0.14, M.steel, px, k * 3.7, pz - w / 2, false); box(g, w, 0.14, 0.14, M.steel, px, k * 3.7, pz + w / 2, false); box(g, 0.14, 0.14, w, M.steel, px - w / 2, k * 3.7, pz, false); box(g, 0.14, 0.14, w, M.steel, px + w / 2, k * 3.7, pz, false); } box(g, 15, 0.3, 0.3, M.steel, px, 24, pz); box(g, 11, 0.3, 0.3, M.steel, px, 29, pz); });
    var p0 = D.pylons[1], p1 = D.pylons[0], dx = p1[0] - p0[0], dy = p1[1] - p0[1], cm = new T.LineBasicMaterial({ color: 0x3a3f48 });
    [[-7, 24], [7, 24], [-5, 29], [5, 29]].forEach(function (c) { var arr = []; for (var s = -1; s <= 2; s++) for (var k = 0; k <= 12; k++) { if (s > -1 && k === 0) continue; var f = k / 12; arr.push(new T.Vector3(X(p0[0] + dx * (s + f)) + c[0], c[1] - 7.5 * 4 * f * (1 - f), Z(p0[1] + dy * (s + f)))); } var ln = new T.Line(new T.BufferGeometry().setFromPoints(arr), cm); g.add(ln); });
    trees(g, (window.TC_TREES || []).filter(function (t) { var du = (t[0] - D.publicParking.cx) * Math.cos(D.publicParking.rot) + (t[1] - D.publicParking.cy) * Math.sin(D.publicParking.rot), dv = -(t[0] - D.publicParking.cx) * Math.sin(D.publicParking.rot) + (t[1] - D.publicParking.cy) * Math.cos(D.publicParking.rot); if (Math.abs(du) < D.publicParking.w / 2 + 3 && Math.abs(dv) < D.publicParking.d / 2 + 3) return false; for (var k = 0; k < D.road.length - 1; k++) { var a = D.road[k], b = D.road[k + 1], ex = b[0] - a[0], ey = b[1] - a[1], f = Math.max(0, Math.min(1, ((t[0] - a[0]) * ex + (t[1] - a[1]) * ey) / (ex * ex + ey * ey))), qx = a[0] + f * ex - t[0], qy = a[1] + f * ey - t[1]; if (qx * qx + qy * qy < 30) return false; } return true; }).concat([[178, 272, 1.1], [194, 262, 1], [184, 244, 1.2], [200, 236, 0.9], [176, 226, 1], [196, 216, 1.1], [205, 252, 1], [186, 208, 0.8], [203, 276, 0.9], [226, 326, 0.9], [236, 300, 1], [92, 296, 1], [96, 262, 0.9], [150, 262, 0.9], [76, 210, 1], [72, 250, 1.1], [70, 170, 1], [72, 130, 0.9], [188, 168, 0.9], [150, 168, 0.8], [216, 205, 0.9], [218, 262, 1], [236, 320, 1.1], [246, 350, 1.1], [150, 118, 0.9], [176, 122, 0.9], [96, 348, 1], [226, 300, 0.9], [164, 150, 0.8]]));
    /* voie d'accès, stationnement, parvis, allées */
    /* parking public en construction au nord (emprise schématique) et sa route d'accès, le long de la piste cyclable */
    var Q = D.publicParking, qe = [Math.cos(Q.rot), Math.sin(Q.rot)], qn = [-Math.sin(Q.rot), Math.cos(Q.rot)], qphi = Math.atan2(qn[1], qn[0]);
    function qp(u, v) { return [Q.cx + u * qe[0] + v * qn[0], Q.cy + u * qe[1] + v * qn[1]]; }
    ribbon(g, D.road, 6, M.asphalt, 0.06); car(g, 126.2, 458, Math.atan2(32, 6), 0x26282c, 1); car(g, 116.2, 428, Math.atan2(-22, -5), 0xe9e9e6, 0);
    var qa = new T.Mesh(muv(new T.PlaneGeometry(Q.w, Q.d), Q.w, Q.d), M.asphalt); qa.rotation.x = -Math.PI / 2; qa.rotation.z = Q.rot; qa.position.set(X(Q.cx), 0.07, Z(Q.cy)); qa.receiveShadow = true; g.add(qa);
    var cols = [0x1b2f4f, 0x7a1f22, 0xe9e9e6, 0x4a4f58, 0x101114, 0xb9bcc2, 0x8d9197, 0x26282c, 0xd9d6cf, 0x5c6066, 0xf1f1ee, 0x2f4a3c];
    [-13.5, -2.5, 2.5, 13.5].forEach(function (v, r) { for (var u = -Q.w / 2 + 3; u <= Q.w / 2 - 3; u += 2.5) { var l = qp(u - 1.25, v), ln = box(g, 4.8, 0.02, 0.1, M.line, X(l[0]), 0.09, Z(l[1]), false); ln.rotation.y = qphi; if (rnd() < 0.5) continue; var c = qp(u, v); car(g, c[0], c[1], qphi + (r % 2 ? Math.PI : 0) + (rnd() - 0.5) * 0.05, cols[Math.floor(rnd() * cols.length)]); } });
    [[-40, 0], [-14, 0], [14, 0], [40, 0]].forEach(function (t) { var c = qp(t[0], t[1]); box(g, 0.16, 7, 0.16, M.steel, X(c[0]), 3.5, Z(c[1])); });
    /* liaison piétonne du parking public au parvis ; jardin à la place de l'ancien parking du projet */
    plane(g, { x: 172, y: 291, w: 47, d: 5 }, M.paving, 0.08); plane(g, { x: 215, y: 291, w: 4.5, d: 54 }, M.paving, 0.08);
    plane(g, { x: 96, y: 288, w: 76, d: 15 }, M.paving, 0.08); plane(g, { x: 161, y: 198, w: 6, d: 92 }, M.paving, 0.08); plane(g, { x: 80, y: 214, w: 84, d: 5 }, M.paving, 0.075); plane(g, { x: 146, y: 162, w: 5, d: 54 }, M.paving, 0.08); plane(g, { x: 78, y: 161.5, w: 96, d: 5 }, M.paving, 0.075); plane(g, { x: 74, y: 116, w: 4, d: 48 }, M.paving, 0.075);
    /* courts extérieurs */
    D.courts.forEach(function (c) { court(g, c, M.clay, 0.09, true); });
    fenceRect(g, 104, 304, 6 * 18.3, 36.6, 3.4); fenceRect(g, 80, 124, 5 * 18.3, 36.6, 3.4);
    for (i = 0; i < 6; i++) { box(g, 2.2, 0.45, 0.5, M.woodDark, X(104 + 9.15 + i * 18.3 + 7), 0.3, Z(322.3), false); }
    /* court central et tribunes */
    var C0 = D.centre; plane(g, { x: 111.5, y: 172.5, w: 21, d: 41 }, M.hardG, 0.085); court(g, { x: C0.x + 3.665, y: C0.y + 6.415, w: 10.97, d: 23.77 }, M.hardB, 0.1, false);
    C0.stands.forEach(function (t, k) { for (var s = 0; s < 8; s++) { var w = 1.2, xx = k === 0 ? t.x + t.w - (s + 1) * w : t.x + s * w; slab(g, { x: xx, y: t.y, w: w, d: t.d }, 0.5 + s * 0.45, M.conc, 0); slab(g, { x: xx + 0.25, y: t.y + 0.4, w: 0.7, d: t.d - 0.8 }, 0.1, M.seat, 0.5 + s * 0.45, false); } var bx = k === 0 ? t.x - 0.15 : t.x + t.w + 0.15; box(g, 0.3, 4.6, t.d, M.woodDark, X(bx), 2.3, Z(t.y + t.d / 2)); });
    [[100, 174], [145, 174], [100, 212], [145, 212]].forEach(function (p) { box(g, 0.32, 17, 0.32, M.steel, X(p[0]), 8.5, Z(p[1])); box(g, 2.6, 1.3, 0.5, M.dark, X(p[0]), 17, Z(p[1]), false); });
    /* hall de tennis */
    var H = D.b.hall; hall(g, H, M.hardG, 1);
    for (i = 0; i < 4; i++) { court(g, { x: H.x + 0.4 + i * 18.3 + 3.665, y: H.y + 0.7 + 6.415, w: 10.97, d: 23.77 }, M.hardB, PL + 0.03, false); }
    for (i = 1; i < 4; i++) { var nt = new T.Mesh(new T.PlaneGeometry(34, 3), M.fence); nt.rotation.y = Math.PI / 2; nt.position.set(X(H.x + 0.4 + i * 18.3), PL + 1.5, Z(H.y + H.d / 2)); g.add(nt); ghosts.push(nt); }
    /* hall de padel */
    var Pd = D.b.padel; hall(g, Pd, M.conc, -1);
    for (i = 0; i < 4; i++) {
      var o = { x: Pd.x + 1.6 + i * 11, y: Pd.y + 2, w: 10, d: 20 }, cx = X(o.x + 5), cz = Z(o.y + 10); plane(g, o, M.padel, PL + 0.03);
      [[10, 0.04, 0, -10], [10, 0.04, 0, 10], [0.04, 20, -5, 0], [0.04, 20, 5, 0]].forEach(function (w) { box(g, w[0], 3, w[1], M.glass, cx + w[2], PL + 1.5, cz + w[3], false); });
      [[-5, -10], [5, -10], [-5, 10], [5, 10], [-5, 0], [5, 0]].forEach(function (q) { box(g, 0.08, 4, 0.08, M.dark, cx + q[0], PL + 2, cz + q[1], false); });
      (function () { function pl(w, d, dx, dz) { var p = new T.Mesh(new T.PlaneGeometry(w, d), M.line); p.rotation.x = -Math.PI / 2; p.position.set(cx + dx, PL + 0.05, cz + dz); g.add(p); } pl(10, 0.06, 0, -6.95); pl(10, 0.06, 0, 6.95); pl(0.06, 13.9, 0, 0); })();
      var n = new T.Mesh(new T.PlaneGeometry(10, 0.9), M.net); n.position.set(cx, PL + 0.45, cz); g.add(n); ghosts.push(n);
    }
    /* club-house : deux niveaux, terrasse au nord face aux courts */
    var C = D.b.club, ccx = X(C.x + C.w / 2), ccz = Z(C.y + C.d / 2), zn = Z(C.y + C.d), zs = Z(C.y);
    slab(g, { x: C.x - 3, y: C.y - 3, w: C.w + 6, d: C.d + 9 }, PL, M.conc, 0);
    clubhouse(g, C);
    var cr = new T.Group(); box(cr, C.w + 1.6, 0.4, C.d + 7.6, M.white, ccx, PL + 7.4, ccz - 3); box(cr, C.w - 2, 0.1, C.d - 1, S({ color: 0x6f8f62, roughness: 1 }), ccx, PL + 7.65, ccz); for (i = 0; i < 9; i++) box(cr, 3.4, 0.08, 6, M.pv, ccx - 18 + i * 4.4, PL + 7.95, ccz + 3, false).rotation.x = 0.16; g.add(cr); roofs.push(cr);
    box(g, 10, 0.12, 12, M.conc, ccx, PL / 2, Z(C.y + C.d + 12), false).rotation.x = -Math.atan2(PL, 12);
    box(g, 6, 0.12, 10, M.conc, X(H.x + H.w - 8), PL / 2, Z(H.y + H.d + 7.5), false).rotation.x = -Math.atan2(PL, 10);
    box(g, 6, 0.12, 10, M.conc, X(Pd.x + 6), PL / 2, Z(Pd.y + Pd.d + 7.5), false).rotation.x = -Math.atan2(PL, 10);
    /* personnages */
    [[130, 294, 0, 0.4, "stand"], [133, 295.5, 0, 3.4, "stand"], [112, 291, 0, 1.2, "walk"], [158, 297, 0, -1.6, "walk"], [164, 250, 0, 3.1, "walk"], [148, 190, 0, 0.2, "walk"],
    [116, 316, 0, 0, "player"], [112, 333, 0, 3.1, "player"], [150, 315, 0, 0, "player"], [153, 334, 0, 3.1, "player"], [190, 312, 0, 0.2, "player"], [186, 335, 0, 3.1, "player"],
    [120, 184, 0, 0, "player"], [123, 203, 0, 3.1, "player"], [90, 136, 0, 0, "player"], [93, 152, 0, 3.1, "player"], [128, 134, 0, 0, "player"], [146, 150, 0, 3.1, "player"],
    [96, 232, PL, 0, "player"], [99, 252, PL, 3.1, "player"], [115, 233, PL, 0, "player"], [118, 251, PL, 3.1, "player"], [133, 232, PL, 0.1, "player"], [150, 250, PL, 3.1, "player"],
    [167, 182, PL, 0, "player"], [163, 193, PL, 3.1, "player"], [178, 180, PL, 0, "player"], [189, 194, PL, 3.1, "player"],
    [110, 291.5, PL + 3.95, 0, "stand"], [124, 291, PL + 3.95, 0.5, "stand"], [136, 290.5, PL + 3.95, -0.4, "stand"], [116, 281, PL, 2, "staff"],
    [135.15, 186, 0.95, -1.57, "sit"], [135.15, 196, 0.95, -1.57, "sit"], [136.35, 191, 1.4, -1.57, "sit"], [108.85, 188, 0.95, 1.57, "sit"], [107.65, 200, 1.4, 1.57, "sit"], [108.85, 196, 0.95, 1.57, "sit"],
    [44, 180, 0, 0.25, "walk"], [20, 96, 0, 3.4, "walk"], [96, 60, 0, 1, "stand"], [104, 74, 0, 2, "walk"], [217, 318, 0, 3.2, "walk"], [216.5, 336, 0, 3.1, "walk"], [200, 293.5, 0, -1.5, "walk"], [186, 240, 0, 0.6, "stand"], [187.2, 241, 0, -2.2, "stand"], [176, 262, 0, 2.6, "walk"], [140, 296, 0, 1.2, "stand"], [141.2, 296.6, 0, -1.9, "stand"], [120, 299, 0, -1.3, "walk"], [165, 366, 0, 2.2, "walk"], [198, 371, 0, 2.6, "stand"], [62, 262, 0, 0.26, "walk"], [70, 300, 0, 3.4, "walk"], [164, 215, 0, 0, "walk"], [148, 172, 0, 1.6, "stand"]].forEach(function (p) { person(p[0], p[1], p[2], p[3], p[4]); });
    /* crue HQ100 : nappe reprise de la carte des zones inondables */
    var ft = new T.TextureLoader().load("flood.png"); ft.encoding = T.sRGBEncoding;
    floodM = new T.Mesh(new T.PlaneGeometry(716.8, 537.6), S({ map: ft, transparent: true, roughness: 0.06, metalness: 0.55, envMapIntensity: 1.4, depthWrite: false })); floodM.rotation.x = -Math.PI / 2; floodM.position.set(X(230), 0.42, Z(247)); floodM.visible = false; floodM.renderOrder = 2; g.add(floodM); ghosts.push(floodM);
    flush(g); flushCars(g);
    /* étiquettes : projet en blanc, existant en noir */
    label(g, "HALL DE TENNIS", 121, 241, 40); label(g, "HALL DE PADEL", 181, 188, 22); label(g, "CLUB-HOUSE", 100, 284, 30); label(g, "COURT CENTRAL", 122, 193, 12); label(g, "COURTS EN TERRE BATTUE", 196, 326, 10); label(g, "COURTS EN TERRE BATTUE", 126, 142, 10); label(g, "JARDIN", 190, 244, 14);
    label(g, "CIPA", 262, 304, 30, true); label(g, "PISTE CYCLABLE", 46, 190, 18, true); label(g, "AIRE DE JEUX · PUMPTRACK", 100, 68, 20, true); label(g, "ALZETTE", -108, 220, 22, true); label(g, "LIGNE À HAUTE TENSION", 60, 300, 42, true); label(g, "CITÉ · RUE PRINCE HENRI", 150, -50, 24, true); label(g, "PARC DU CIPA", 290, 150, 26, true); label(g, "PARKING PUBLIC · EN CONSTRUCTION", D.publicParking.cx, D.publicParking.cy, 12, true); label(g, "NOUVELLE ROUTE", 126, 462, 14, true);
  }

  /* ---------- personnages Rocketbox ---------- */
  var POOL = {
    player: [["Sports_Male_04", "runA"], ["Sports_Female_02", "runB"], ["Male_Adult_01", "runA"], ["Female_Adult_08", "runA"], ["Sports_Male_04", "runB"], ["Sports_Female_02", "runA"], ["Male_Adult_01", "runB"], ["Female_Adult_08", "runB"], ["Sports_Male_04", "cheer"], ["Sports_Female_02", "walk"]],
    sit: [["Male_Adult_08", "sitN"], ["Female_Adult_01", "sitR"], ["Business_Male_02", "sitN"], ["Female_Adult_05", "sitR"], ["Male_Adult_14", "sitR"], ["Business_Female_02", "sitN"]],
    stand: [["Male_Adult_17", "phone"], ["Female_Adult_08", "talk"], ["Male_Adult_08", "talk"], ["Business_Male_02", "drink"], ["Female_Adult_05", "idle2"], ["Male_Adult_14", "phone"], ["Business_Female_02", "talk"], ["Female_Adult_01", "talk2"]],
    staff: [["Male_Adult_11", "idle"]], walk: [["Male_Adult_17", "walk"], ["Female_Adult_05", "walk"], ["Male_Adult_01", "walk"], ["Sports_Female_02", "walk"]]
  };
  function b64(s, Type) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Type(u.buffer); }
  function addPeople(P) {
    var gc = {}, mc = {}, loader = new T.TextureLoader(), cnt = {};
    function mats(name) {
      if (mc[name]) return mc[name];
      return (mc[name] = P[name].groups.map(function (gr) {
        var code = gr.name.split("_")[0], kind = gr.name.indexOf("opacity") >= 0 ? "opacity" : gr.name.indexOf("head") >= 0 ? "head" : gr.name.indexOf("body") >= 0 ? "body" : null;
        if (!kind) return new T.MeshBasicMaterial({ visible: false });
        var tx = loader.load("ppl/" + code + "_" + kind + "_color." + (kind === "opacity" ? "png" : "jpg")); tx.encoding = T.sRGBEncoding; tx.anisotropy = 4;
        return new T.MeshStandardMaterial(kind === "opacity" ? { map: tx, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.75 } : { map: tx, roughness: 0.78, envMapIntensity: 0.6 });
      }));
    }
    function geom(name, pose) {
      var key = name + "/" + pose; if (gc[key]) return gc[key];
      var a = P[name], n = a.n, q = b64(a.poses[pose].p, Int16Array), uvq = b64(a.uv, Uint16Array), pid = b64(a.pid, Uint16Array), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), i;
      for (i = 0; i < n * 3; i++) pos[i] = q[i] / 8000; for (i = 0; i < n * 2; i++) uv[i] = uvq[i] / 65535;
      var ge = new T.BufferGeometry(), idx = [], off = 0; ge.setAttribute("position", new T.BufferAttribute(pos, 3)); ge.setAttribute("uv", new T.BufferAttribute(uv, 2));
      a.groups.forEach(function (gr, gi) { var ix = b64(gr.idx, n > 65535 ? Uint32Array : Uint16Array); for (var k = 0; k < ix.length; k++) idx.push(ix[k]); ge.addGroup(off, ix.length, gi); off += ix.length; });
      ge.setIndex(idx); ge.computeVertexNormals();
      var nr = ge.attributes.normal.array, acc = {}, p;
      for (i = 0; i < n; i++) { p = acc[pid[i]] || (acc[pid[i]] = [0, 0, 0]); p[0] += nr[i * 3]; p[1] += nr[i * 3 + 1]; p[2] += nr[i * 3 + 2]; }
      for (i = 0; i < n; i++) { p = acc[pid[i]]; var l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) || 1; nr[i * 3] = p[0] / l; nr[i * 3 + 1] = p[1] / l; nr[i * 3 + 2] = p[2] / l; }
      return (gc[key] = ge);
    }
    var rk = new T.CylinderGeometry(1, 1, 1, 14);
    spots.forEach(function (s) {
      var pool = POOL[s.kind] || POOL.stand, k = cnt[s.kind] = (cnt[s.kind] || 0) + 1, pick = pool[(k - 1) % pool.length];
      if (!P[pick[0]] || !P[pick[0]].poses[pick[1]]) return;
      var me = new T.Mesh(geom(pick[0], pick[1]), mats(pick[0])); me.position.set(X(s.x), s.h + 0.02, Z(s.y)); me.rotation.y = Math.PI - s.yaw; me.castShadow = true; me.receiveShadow = true;
      if (s.kind === "player") {
        var ps = P[pick[0]].poses[pick[1]], h = new T.Vector3().fromArray(ps.hand), d = h.clone().sub(new T.Vector3().fromArray(ps.fore)).normalize();
        var hd = new T.Mesh(rk, M.dark); hd.scale.set(0.016, 0.24, 0.016); hd.position.copy(h).addScaledVector(d, 0.14); hd.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d); me.add(hd);
        var nn = d.clone().cross(new T.Vector3(0, 1, 0)); if (nn.lengthSq() < 0.01) nn.set(1, 0, 0); nn.normalize();
        var hoop = new T.Mesh(rk, M.led); hoop.scale.set(0.13, 0.03, 0.13); hoop.position.copy(h).addScaledVector(d, 0.39); hoop.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), nn); me.add(hoop);
      }
      scene.add(me);
    });
  }
  function loadPeople() { var sc = document.createElement("script"); sc.src = "people.js"; sc.onload = function () { try { addPeople(window.PADEL_PEOPLE); } catch (e) { if (window.console) console.warn(e); } }; document.head.appendChild(sc); }

  /* ---------- ciel, lumière, post-traitement ---------- */
  function sky() { var t = tex(16, 256, function (k, w, h) { var gr = k.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#3f77b8"); gr.addColorStop(0.42, "#8fb6dc"); gr.addColorStop(0.5, "#d3e0ea"); gr.addColorStop(0.56, "#c3d0d6"); gr.addColorStop(1, "#aebbbf"); k.fillStyle = gr; k.fillRect(0, 0, w, h); }); t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return new T.Mesh(new T.SphereGeometry(2600, 24, 16), new T.MeshBasicMaterial({ map: t, side: T.BackSide, fog: false, depthWrite: false })); }
  function setupPost() {
    if (!T.EffectComposer || !T.SSAOPass || !renderer.capabilities.isWebGL2) return;
    try {
      var w = stage.clientWidth || 800, h = stage.clientHeight || 600, rt = new T.WebGLRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType });
      composer = new T.EffectComposer(renderer, rt); ssao = new T.SSAOPass(scene, cam, w, h);
      ssao.kernelRadius = 1.1; ssao.minDistance = 0.00004; ssao.maxDistance = 0.0035;
      ssao.beautyRenderTarget.texture.type = T.HalfFloatType; ssao.normalRenderTarget.depthTexture.type = T.UnsignedIntType;
      var dtx = new T.DepthTexture(); dtx.type = T.UnsignedIntType; ssao.beautyRenderTarget.depthTexture = dtx;
      var ro = ssao.renderOverride.bind(ssao);
      ssao.renderOverride = function (a, b, c, d, e) { var i; for (i = 0; i < ghosts.length; i++) { ghosts[i].userData.v = ghosts[i].visible; ghosts[i].visible = false; } ro(a, b, c, d, e); for (i = 0; i < ghosts.length; i++) ghosts[i].visible = ghosts[i].userData.v; };
      composer.addPass(ssao); composer.addPass(new T.ShaderPass(T.GammaCorrectionShader)); fxaa = new T.ShaderPass(T.FXAAShader); composer.addPass(fxaa);
    } catch (e) { composer = null; if (window.console) console.warn("post-traitement indisponible", e); }
  }

  /* ---------- déplacement ---------- */
  function groundH(x, y) {
    var C = D.b.club, i;
    if (x > C.x && x < C.x + C.w && y > C.y && y < C.y + C.d + 6) { var su = x - C.x, sv = y - C.y; if (su > 28.6 && su < 30.8 && sv > 9.8 && sv < 16.2) return PL + (sv - 9.8) / 6.4 * 3.9; if (walk.h - 1.7 > PL + 1.95) return PL + 3.92; }
    for (i = 0; i < 2; i++) { var t = D.centre.stands[i]; if (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.d) { var s = i === 0 ? (t.x + t.w - x) : (x - t.x); return 0.5 + Math.floor(s / 1.2) * 0.45; } }
    var r = [D.b.hall, D.b.padel, { x: C.x, y: C.y, w: C.w, d: C.d + 6 }];
    for (i = 0; i < r.length; i++) if (x > r[i].x - 3 && x < r[i].x + r[i].w + 3 && y > r[i].y - 3 && y < r[i].y + r[i].d + 3) return PL;
    return 0;
  }
  var VIEWS = {
    parvis: ["Parvis", 170, 301, null, 120, 280, 4.2], hall: ["Hall de tennis", 86.5, 224.5, null, 140, 252, 2.4], padel: ["Hall de padel", 159.5, 177.2, null, 196, 196, 1.8],
    parking: ["Parking public", 150, 359, null, 172, 373, 0.9], jardin: ["Jardin", 164, 276, null, 196, 236, 1.6], central: ["Court central", 103, 186, 3.65, 122, 194, 0.6], terrasse: ["Terrasse du club-house", 122.2, 292.6, PL + 3.92, 150, 332, 2.2], accueil: ["Accueil du club-house", 124.2, 286.6, PL, 118.5, 277, 1.9], restaurant: ["Restaurant", 129.7, 287.3, PL + 3.92, 108, 277, 4.9], bar: ["Bar", 131.5, 285.5, PL + 3.92, 138, 277, 5.0], vestiaires: ["Vestiaires", 114.2, 286.8, PL, 104, 281.5, 1.6], boutique: ["Boutique", 132.6, 283.4, PL, 142, 279, 2.0], piste: ["Piste cyclable", 30, 128, null, 110, 230, 6]
  };
  function go(name) { idle = name === "maquette" ? 2 : 0;
    document.querySelectorAll("#views [data-go]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-go") === name ? "true" : "false"); });
    if (name === "maquette") { mode = "orbit"; hud.textContent = "Vue d’ensemble"; }
    else { var v = VIEWS[name]; mode = "walk"; walk.x = v[1]; walk.y = v[2]; walk.h = (v[3] === null ? groundH(v[1], v[2]) : v[3]) + 1.7; var dx = v[4] - v[1], dy = v[5] - v[2]; walk.yaw = Math.atan2(dx, dy); walk.pitch = Math.atan2(v[6] - walk.h, Math.sqrt(dx * dx + dy * dy)); hud.textContent = v[0]; }
    stage.setAttribute("data-mode", mode); showLabels();
  }
  var labelsOn = true; function showLabels() { labels.forEach(function (l) { l.visible = labelsOn && mode === "orbit"; }); }
  function place() {
    if (mode === "orbit") { var o = orbit; cam.position.set(o.tx + o.r * Math.sin(o.ph) * Math.sin(o.th), o.r * Math.cos(o.ph), o.tz + o.r * Math.sin(o.ph) * Math.cos(o.th)); cam.lookAt(o.tx, 0, o.tz); }
    else { cam.position.set(X(walk.x), walk.h, Z(walk.y)); var cp = Math.cos(walk.pitch); cam.lookAt(X(walk.x) + Math.sin(walk.yaw) * cp, walk.h + Math.sin(walk.pitch), Z(walk.y) - Math.cos(walk.yaw) * cp); }
  }
  function step(dt) {
    if (mode !== "walk") return;
    var f = (keys.ArrowUp || keys.w || keys.z || pad.f ? 1 : 0) - (keys.ArrowDown || keys.s || pad.b ? 1 : 0), st = (keys.d || pad.r ? 1 : 0) - (keys.a || keys.q || pad.l ? 1 : 0), tu = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    walk.yaw += tu * 1.6 * dt;
    if (f || st) { var sp = (keys.Shift ? 16 : 5.5) * dt; walk.x = Math.max(-230, Math.min(560, walk.x + (Math.sin(walk.yaw) * f + Math.cos(walk.yaw) * st) * sp)); walk.y = Math.max(-80, Math.min(560, walk.y + (Math.cos(walk.yaw) * f - Math.sin(walk.yaw) * st) * sp)); }
    var target = groundH(walk.x, walk.y) + 1.7; walk.h += (target - walk.h) * Math.min(1, dt * 8);
  }
  function frame(t) { if (!running) return; var dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; idle += dt; if (mode === "orbit" && !calm && idle > 3.5) orbit.th += dt * 0.028 * Math.min(1, (idle - 3.5) / 2); step(dt); place(); if (hq && composer) composer.render(); else renderer.render(scene, cam); if (!shown) { shown = true; stage.classList.add("live"); } raf = requestAnimationFrame(frame); }
  function size() {
    var w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; var pr = Math.min(window.devicePixelRatio || 1, hq && composer ? 1.5 : 2);
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); if (fxaa) fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); }
  }
  function start() {
    try { renderer = new T.WebGLRenderer({ antialias: true }); } catch (e) { var d = document.createElement("div"); d.className = "nogl"; d.textContent = "L’affichage 3D n’est pas disponible dans ce navigateur. Le plan masse de l’onglet Faisabilité montre le même projet."; stage.appendChild(d); return false; }
    renderer.outputEncoding = T.sRGBEncoding; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    stage.insertBefore(renderer.domElement, stage.firstChild); renderer.domElement.setAttribute("tabindex", "0"); renderer.domElement.setAttribute("aria-label", "Maquette 3D du campus");
    scene = new T.Scene(); scene.fog = new T.Fog(0xd9e4ec, 560, 1500); cam = new T.PerspectiveCamera(52, 1, 0.4, 3200);
    scene.add(sky());
    try { var pm = new T.PMREMGenerator(renderer), es = new T.Scene(); es.add(sky()); scene.environment = pm.fromScene(es, 0.02, 1, 6000).texture; pm.dispose(); } catch (e) { }
    scene.add(new T.HemisphereLight(0xe6efff, 0x8a9474, 0.14));
    var sun = new T.DirectionalLight(0xfff0d8, 0.78); sun.position.set(260, 330, 210); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    var sc = sun.shadow.camera; sc.left = -330; sc.right = 330; sc.top = 330; sc.bottom = -330; sc.near = 20; sc.far = 1100; sc.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06; scene.add(sun);
    materials(); build(); setupPost(); size(); go("maquette"); loadPeople();
    var el = renderer.domElement, ptr = {}, pinch = 0;
    el.addEventListener("pointerdown", function (e) { idle = 0; stage.classList.add("touched"); try { el.setPointerCapture(e.pointerId); } catch (x) { } ptr[e.pointerId] = [e.clientX, e.clientY]; el.focus({ preventScroll: true }); });
    el.addEventListener("pointermove", function (e) {
      var p = ptr[e.pointerId]; if (!p) return; var ids = Object.keys(ptr);
      if (ids.length === 2) { ptr[e.pointerId] = [e.clientX, e.clientY]; var a = ptr[ids[0]], b = ptr[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch && mode === "orbit") orbit.r = Math.max(50, Math.min(950, orbit.r * pinch / d)); pinch = d; return; }
      var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptr[e.pointerId] = [e.clientX, e.clientY]; idle = 0;
      if (mode === "orbit") { orbit.th -= dx * 0.005; orbit.ph = Math.max(0.1, Math.min(1.5, orbit.ph - dy * 0.004)); } else { walk.yaw -= dx * 0.004; walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch + dy * 0.003)); }
    });
    function up(e) { delete ptr[e.pointerId]; pinch = 0; }
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", function (e) { if (mode !== "orbit" || !e.ctrlKey) return; idle = 0; e.preventDefault(); orbit.r = Math.max(50, Math.min(950, orbit.r * (e.deltaY > 0 ? 1.1 : 0.91))); }, { passive: false });
    window.addEventListener("keydown", function (e) { if (!running || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ""))) return; var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true; if (mode === "walk" && /^Arrow/.test(k)) e.preventDefault(); if (mode === "orbit" && (k === "+" || k === "=")) orbit.r = Math.max(50, orbit.r * 0.88); if (mode === "orbit" && k === "-") orbit.r = Math.min(950, orbit.r * 1.14); });
    window.addEventListener("keyup", function (e) { var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; });
    window.addEventListener("blur", function () { keys = {}; pad = {}; });
    document.querySelectorAll("[data-pad]").forEach(function (b) { var k = b.getAttribute("data-pad"); b.addEventListener("pointerdown", function (e) { e.preventDefault(); pad[k] = true; }); ["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { b.addEventListener(n, function () { pad[k] = false; }); }); });
    document.querySelectorAll("[data-zoom]").forEach(function (b) { b.addEventListener("click", function () { idle = 0; orbit.r = Math.max(50, Math.min(950, orbit.r * parseFloat(b.getAttribute("data-zoom")))); }); });
    document.querySelectorAll("#views [data-go]").forEach(function (b) { b.addEventListener("click", function () { go(b.getAttribute("data-go")); }); });
    function toggle(id, fn) { var b = document.getElementById(id); if (b) b.addEventListener("click", function () { var on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on ? "true" : "false"); fn(on); }); }
    toggle("flood", function (on) { floodM.visible = on; }); toggle("roof", function (on) { roofs.forEach(function (r) { r.visible = on; }); });
    toggle("marks", function (on) { labelsOn = on; showLabels(); }); toggle("hq", function (on) { hq = on; size(); });
    (document.getElementById("fs") || document.createElement("i")).addEventListener("click", function () { try { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen().catch(function () { }); } catch (e) { } });
    window.addEventListener("resize", size); document.addEventListener("fullscreenchange", function () { setTimeout(size, 60); });
    api.go = go; api.debug = { info: function () { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, post: !!composer }; }, once: function () { place(); var t = performance.now(); if (hq && composer) composer.render(); else renderer.render(scene, cam); renderer.getContext().finish(); return performance.now() - t; }, go: go, orbit: orbit, flood: function (v) { floodM.visible = v; }, hq: function (v) { hq = v; size(); }, labels: function (v) { labelsOn = v; showLabels(); } };
    return true;
  }
  api.visible = function (on) {
    if (on && !started) { started = true; if (!start()) return; }
    if (!renderer) return;
    if (on && !running) { running = true; size(); last = performance.now(); raf = requestAnimationFrame(frame); } else if (!on && running) { running = false; cancelAnimationFrame(raf); }
  };
})();
