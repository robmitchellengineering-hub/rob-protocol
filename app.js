/* ============================================================
   ROB — Robust Object Broadcast · WebGL explainer engine
   One fixed canvas, one scene, per-section animated groups,
   bloom for the "shiny", scroll-driven.
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('scene');

/* ---------- tiny helpers ---------- */

const glowTex = glowTexture();

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowSprite(color, scale = 2.6) {
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

function labelSprite(text, color = '#e7edf7', width = 4.2) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '600 40px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(text, 10, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(width, width * (96 / 512), 1);
  return s;
}

function box(w, h, d, color, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
  );
  return m;
}

function line(points, color, opacity = 0.5) {
  const pts = points.map((p) => (Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(
    g,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  );
}

function curve3(pts) {
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
}

/* ---------- renderer / scene / camera / bloom ---------- */

function webglFail() {
  const d = document.createElement('div');
  d.className = 'noscript';
  d.textContent = 'WebGL is not available in this browser — the animated scenes need it. The text still reads fine.';
  document.body.appendChild(d);
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  webglFail();
  throw e;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x05070d, 0.011);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 0.5, 16);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.7, 0.16);
composer.addPass(bloom);

/* ---------- ambient starfield (always on) ---------- */

const starGeo = new THREE.BufferGeometry();
const starCount = 900;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  starPos[i * 3 + 0] = (Math.random() - 0.5) * 60;
  starPos[i * 3 + 1] = (Math.random() - 0.5) * 34;
  starPos[i * 3 + 2] = (Math.random() - 0.5) * 24 - 6;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0x5f7ea8, size: 0.04, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
);
scene.add(stars);

/* ---------- builders ---------- */

// shared packet factory
function makePacket(color, size = 0.52) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size * 0.5, size * 0.32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
  );
  g.add(mesh);
  const glow = glowSprite(color, size * 2.6);
  g.add(glow);
  return g;
}

// a stream: packets travelling along parallel curves
function makeStream(from, to, count, color, speedMin, speedMax) {
  const group = new THREE.Group();
  const curves = [];
  const packets = [];
  for (let k = 0; k < 3; k++) {
    const spread = (k - 1) * 0.8;
    const pts = [
      from,
      [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + spread * 0.6 + 0.6, from[2]],
      to,
    ];
    const c = curve3(pts);
    curves.push(c);
    group.add(line(pts, color, 0.22));
  }
  for (let i = 0; i < count; i++) {
    const p = makePacket(color);
    p.userData = { curve: i % 3, t: Math.random(), speed: speedMin + Math.random() * (speedMax - speedMin) };
    p.position.copy(curves[p.userData.curve].getPointAt(0));
    packets.push(p);
    group.add(p);
  }
  group.userData = { curves, packets };
  return group;
}

function updateStream(group, dt) {
  const { curves, packets } = group.userData;
  for (const p of packets) {
    const u = p.userData;
    u.t += u.speed * dt;
    if (u.t > 1) u.t -= 1;
    const pos = curves[u.curve].getPointAt(Math.min(Math.max(u.t, 0.001), 0.999));
    p.position.copy(pos);
  }
}

// node marker
function makeNode(color, label = '', scale = 1) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.7 * scale, 1),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 })
  );
  g.add(core);
  const inner = glowSprite(color, 2.6 * scale);
  g.add(inner);
  if (label) {
    const l = labelSprite(label, color, 2.6 * scale);
    l.position.y = -1.5 * scale;
    g.add(l);
  }
  return g;
}

/* --- hero: dual nodes, streaming packets, rotating wireframe sphere --- */
function buildHero() {
  const group = new THREE.Group();

  const left = makeNode(0x38bdf8, 'SOURCE', 1.15);
  left.position.set(-8.5, 0, 0);
  group.add(left);

  const right = makeNode(0x34d399, 'RECEIVER', 1.15);
  right.position.set(8.5, 0, 0);
  group.add(right);

  const stream = makeStream([-8.5, 0, 0], [8.5, 0, 0], 22, 0x22d3ee, 0.18, 0.4);
  group.add(stream);

  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(9.5, 1),
    new THREE.MeshBasicMaterial({ color: 0x1b3a5c, wireframe: true, transparent: true, opacity: 0.12 })
  );
  wire.position.set(0, 0, -10);
  group.add(wire);

  group.userData = { stream, wire, left, right };
  return { group, update(st, t, dt) {
    updateStream(stream, dt);
    left.rotation.y = t * 0.3; left.rotation.x = t * 0.15;
    right.rotation.y = -t * 0.3; right.rotation.x = t * 0.15;
    wire.rotation.y = t * 0.06;
    wire.rotation.x = Math.sin(t * 0.2) * 0.2;
  } };
}

/* --- problem: a stream that jitters, stalls, spikes red --- */
function buildProblem() {
  const group = new THREE.Group();
  const stream = makeStream([-8.5, 0, 0], [8.5, 0, 0], 26, 0x22d3ee, 0.16, 0.34);
  group.add(stream);

  // a "latency spike" bar that pulses
  const spike = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12),
    new THREE.MeshBasicMaterial({ color: 0xf87171 })
  );
  spike.position.set(0, 0, 0);
  spike.scale.set(1, 0.01, 1);
  spike.visible = false;
  group.add(spike);
  const spikeGlow = glowSprite(0xf87171, 5);
  spikeGlow.visible = false;
  spike.add(spikeGlow);

  group.userData = { stream, spike, spikeGlow, nextSpike: 1.2, glitch: null };
  return { group, update(st, t, dt) {
    updateStream(stream, dt);

    // periodic glitch: stall one packet + red spike
    if (t > st.nextSpike) {
      st.nextSpike = t + 3.2 + Math.random() * 2.4;
      st.glitch = { until: t + 0.9, packet: stream.userData.packets[Math.floor(Math.random() * stream.userData.packets.length)] };
    }
    if (st.glitch) {
      const g = st.glitch;
      if (g.packet) g.packet.userData.speed = 0.03; // stall
      st.spike = Math.min(1, (g.until - t) / 0.9);
      if (t > g.until) {
        if (g.packet) g.packet.userData.speed = 0.2 + Math.random() * 0.2;
        st.glitch = null;
      }
    }
    if (st.glitch) {
      spike.visible = true;
      spike.position.set(0, 0, 0);
      spike.scale.set(1.6 + Math.random() * 0.4, 2.5 + Math.random() * 4, 1);
      spikeGlow.visible = true;
    } else {
      spike.visible = false;
      spikeGlow.visible = false;
    }
  } };
}

/* --- packet anatomy: exploded layered slab --- */
const PACKET_LAYERS = [
  { key: 'rtp',   name: 'RTP HEADER',        sub: 'seq · timestamp · SSRC', color: 0x38bdf8, h: 0.42, bits: 'RFC 3550' },
  { key: 'ext',   name: 'ROB CORE EXTENSION', sub: 'mode · path · slot · budget', color: 0xa78bfa, h: 0.62, bits: 'RFC 8285' },
  { key: 'pcm24', name: 'AUDIO · 24-BIT',     sub: 'this period', color: 0x34d399, h: 0.72, bits: 'full quality' },
  { key: 'pcm16', name: 'AUDIO · 16-BIT',     sub: 'previous period', color: 0x22d3ee, h: 0.72, bits: 'top 16 bits' },
  { key: 'bc10',  name: 'AUDIO · 10-BIT',     sub: 'two periods back', color: 0xfbbf24, h: 0.72, bits: 'companded' },
  { key: 'auth',  name: 'SRTP AUTH TAG',      sub: 'integrity', color: 0xf472b6, h: 0.3, bits: 'AES-128-GCM' },
];

function buildPacket() {
  const group = new THREE.Group();
  const W = 4.6, D = 0.55;
  const slabs = [];
  let y = 0;
  for (const L of PACKET_LAYERS) {
    const slab = box(W, L.h, D, L.color, 0.96);
    slab.userData = { baseY: y, layer: L };
    group.add(slab);
    const label = labelSprite(L.name, '#' + L.color.toString(16).padStart(6, '0'), 5.4);
    label.position.set(W / 2 + 2.4, 0, 0);
    slab.add(label);
    slabs.push(slab);
    y += L.h + 0.08;
  }
  const total = y - 0.08;
  // centre vertically
  for (const s of slabs) s.userData.baseY -= total / 2;

  group.userData = { slabs, legendRows: [...document.querySelectorAll('#packet-legend .legend-row')] };
  group.rotation.x = 0.0;

  return { group, update(st, t, dt) {
    const ease = st.ease;
    const phase = (t - st.activeAt);
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      const explode = Math.min(1, Math.max(0, (phase - i * 0.08) / 0.9));
      const gap = explode * 0.55;
      s.position.y = s.userData.baseY + i * gap;
      s.position.x = Math.sin(phase * 0.8 + i) * 0.12 * explode;
    }
    group.rotation.y = Math.sin(t * 0.25) * 0.22;
    group.rotation.x = Math.sin(t * 0.18) * 0.12;

    // highlight the legend row matching the "active" slab
    const litIdx = Math.min(slabs.length - 1, Math.floor(phase / 0.55));
    for (let i = 0; i < group.userData.legendRows.length; i++) {
      group.userData.legendRows[i].classList.toggle('lit', i === litIdx);
    }
  } };
}

/* --- layered redundancy: conveyor of packet cards; a lost one recovers --- */
function buildLayers() {
  const group = new THREE.Group();
  const cards = [];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const card = new THREE.Group();
    const dims = [
      { h: 0.44, color: 0x34d399 }, // 24
      { h: 0.44, color: 0x22d3ee }, // 16
      { h: 0.44, color: 0xfbbf24 }, // 10
    ];
    let y = 0.66;
    const blocks = [];
    for (const d of dims) {
      const b = box(1.15, d.h, 0.4, d.color, 0.95);
      b.position.y = y;
      card.add(b);
      blocks.push(b);
      y -= d.h + 0.1;
    }
    card.userData = { x: -7 + i * 3.2, blocks, base: blocks.map((b) => b.material.color.clone()) };
    cards.push(card);
    group.add(card);
  }
  group.userData = { cards, nextLoss: 2.0, lost: null };

  return { group, update(st, t, dt) {
    const cards = group.userData.cards;
    for (const c of cards) {
      c.userData.x -= dt * 1.1;
      if (c.userData.x < -8.4) c.userData.x += N * 3.2;
      c.position.x = c.userData.x;
    }
    // every few seconds, "lose" a card: dim it; the two behind it light up
    if (t > group.userData.nextLoss) {
      group.userData.nextLoss = t + 4.0;
      const idx = Math.floor(Math.random() * N);
      group.userData.lost = { idx, until: t + 1.4 };
    }
    const loss = group.userData.lost;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const isLost = loss && i === loss.idx && t < loss.until;
      const isAfter = loss && (i === (loss.idx + 1) % N || i === (loss.idx + 2) % N) && t < loss.until;
      const b24 = c.userData.blocks[0], b16 = c.userData.blocks[1], b10 = c.userData.blocks[2];
      const base = c.userData.base;
      b24.material.color.copy(base[0]); b16.material.color.copy(base[1]); b10.material.color.copy(base[2]);
      b24.material.opacity = 0.95; b16.material.opacity = 0.95; b10.material.opacity = 0.95;
      b16.scale.setScalar(1); b10.scale.setScalar(1);
      if (isLost) {
        c.children[0].material.color.set(0x6b7280); b16.material.color.set(0x6b7280); b10.material.color.set(0x6b7280);
        b24.material.opacity = 0.25; b16.material.opacity = 0.25; b10.material.opacity = 0.25;
      } else if (isAfter) {
        if (i === (loss.idx + 1) % N) { b16.material.color.set(0xffffff); b16.scale.setScalar(1.25 + Math.sin(t * 30) * 0.06); }
        if (i === (loss.idx + 2) % N) { b10.material.color.set(0xffffff); b10.scale.setScalar(1.25 + Math.sin(t * 30) * 0.06); }
      } else {
        b16.scale.setScalar(1); b10.scale.setScalar(1);
      }
    }
    if (loss && t > loss.until) group.userData.lost = null;
  } };
}

/* --- multipath: one source, two diverging paths, converge on receiver --- */
function buildMultipath() {
  const group = new THREE.Group();
  const src = makeNode(0x38bdf8, 'SOURCE', 0.95);
  src.position.set(-8.5, 0, 0);
  const dst = makeNode(0x34d399, 'RECEIVER', 0.95);
  dst.position.set(8.5, 0, 0);
  group.add(src, dst);

  const top = [[-8.5, 0, 0], [0, 3.2, 0], [8.5, 0, 0]];
  const bot = [[-8.5, 0, 0], [0, -3.2, 0], [8.5, 0, 0]];
  const cTop = curve3(top), cBot = curve3(bot);
  group.add(line(top, 0x22d3ee, 0.2));
  group.add(line(bot, 0xa78bfa, 0.2));

  const packets = [];
  for (let i = 0; i < 18; i++) {
    const onTop = i % 2 === 0;
    const p = makePacket(onTop ? 0x22d3ee : 0xa78bfa, 0.46);
    p.userData = { curve: onTop ? cTop : cBot, t: Math.random() };
    packets.push(p);
    group.add(p);
  }

  const merge = glowSprite(0xffffff, 3);
  merge.position.set(8.5, 0, 0);
  group.add(merge);

  group.userData = { packets, merge, src, dst };
  return { group, update(st, t, dt) {
    for (const p of group.userData.packets) {
      p.userData.t += dt * 0.22;
      if (p.userData.t > 1) p.userData.t -= 1;
      p.position.copy(p.userData.curve.getPointAt(Math.min(Math.max(p.userData.t, 0.002), 0.998)));
    }
    const pulse = 1 + Math.sin(t * 5) * 0.35;
    group.userData.merge.scale.set(2.2 * pulse, 2.2 * pulse, 1);
    group.userData.src.rotation.y = t * 0.4;
    group.userData.dst.rotation.y = -t * 0.4;
  } };
}

/* --- clock: leader + followers, sync rings --- */
function buildClock() {
  const group = new THREE.Group();
  const leader = makeNode(0xfbbf24, 'LEADER', 1.25);
  group.add(leader);

  const followers = [];
  const angles = [0.35, 1.9, 3.5, 5.0];
  for (const a of angles) {
    const f = makeNode(0x38bdf8, '', 0.7);
    f.position.set(Math.cos(a) * 5.5, Math.sin(a) * 5.5 * 0.6, -0.5);
    group.add(f);
    group.add(line([[0, 0, 0], [f.position.x, f.position.y, f.position.z]], 0x38bdf8, 0.12));
    followers.push(f);
  }

  const rings = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 48),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    r.rotation.x = -Math.PI / 2;
    r.scale.setScalar(0.4);
    group.add(r);
    rings.push(r);
  }

  group.userData = { leader, followers, rings };
  return { group, update(st, t, dt) {
    group.userData.leader.rotation.y = t * 0.5;
    for (const f of group.userData.followers) f.rotation.y = -t * 0.4;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const ph = (t * 0.8 + i * 0.25) % 1;
      const s = 0.4 + ph * 6;
      r.scale.set(s, s, 1);
      r.material.opacity = Math.max(0, 0.55 * (1 - ph));
    }
  } };
}

/* --- soft slots: circular nodes, rotating sweep, late packet dropped --- */
function buildSlots() {
  const group = new THREE.Group();
  const N = 7;
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const n = makeNode(0x38bdf8, '', 0.55);
    n.position.set(Math.cos(a) * 5.6, Math.sin(a) * 5.6 * 0.62, 0);
    n.userData = { a };
    group.add(n);
    nodes.push(n);
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.6, 5.66, 96),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  group.add(ring);

  // sweep marker
  const sweep = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.9, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  sweep.position.set(5.6, 0, 0.2);
  group.add(sweep);

  // a "late" packet that falls away
  const late = makePacket(0xf87171, 0.4);
  late.visible = false;
  group.add(late);

  group.userData = { nodes, sweep, late, nextLate: 2.4, lateState: null };
  return { group, update(st, t, dt) {
    const ang = t * 0.7;
    const sx = Math.cos(ang) * 5.6, sy = Math.sin(ang) * 5.6 * 0.62;
    sweep.position.set(sx, sy, 0.2);
    sweep.rotation.z = ang;
    for (const n of group.userData.nodes) {
      const d = Math.abs(((ang - n.userData.a) % (Math.PI * 2)));
      const near = d < 0.28;
      const s = near ? 1.5 : 1;
      n.scale.setScalar(s + Math.sin(t * 20) * 0.03 * (near ? 1 : 0));
    }
    if (t > group.userData.nextLate) {
      group.userData.nextLate = t + 4.2;
      group.userData.lateState = { until: t + 1.6, vy: -2 };
      late.visible = true;
      late.position.set(Math.cos(ang + 0.6) * 5.6, Math.sin(ang + 0.6) * 5.6 * 0.62, 0.3);
    }
    if (group.userData.lateState) {
      late.position.y += group.userData.lateState.vy * dt;
      late.children[0].material.opacity = Math.max(0, (group.userData.lateState.until - t) / 1.6);
      if (t > group.userData.lateState.until) { late.visible = false; group.userData.lateState = null; }
    }
  } };
}

/* --- tiers: rising 3D bars mirroring the DOM chart --- */
function buildTiers() {
  const group = new THREE.Group();
  const heights = [8, 20, 38, 68, 88, 100];
  const bars = [];
  for (let i = 0; i < heights.length; i++) {
    const h = (heights[i] / 100) * 7;
    const b = box(1.5, h, 1.5, i === 5 ? 0xa78bfa : 0x22d3ee, 0.9);
    b.position.set(-8 + i * 3.1, h / 2 - 3.5, 0);
    b.scale.y = 0;
    group.add(b);
    bars.push(b);
  }
  group.userData = { bars };
  return { group, update(st, t, dt) {
    const phase = Math.min(1, (t - st.activeAt) / 1.2);
    for (let i = 0; i < bars.length; i++) {
      const p = Math.max(0, Math.min(1, (phase * 6 - i) / 1.2));
      bars[i].scale.y = p;
      bars[i].material.opacity = 0.4 + p * 0.6;
    }
  } };
}

/* --- outro: slow rotating wireframe + orbiting packets --- */
function buildOutro() {
  const group = new THREE.Group();
  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(6.5, 1),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.22 })
  );
  group.add(wire);

  const packets = [];
  for (let i = 0; i < 14; i++) {
    const p = makePacket(0x22d3ee, 0.36);
    const a = (i / 14) * Math.PI * 2;
    const r = 7.5;
    p.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.5, 0);
    p.userData = { a, r, spd: 0.12 + (i % 3) * 0.03 };
    packets.push(p);
    group.add(p);
  }

  group.userData = { wire, packets };
  return { group, update(st, t, dt) {
    group.userData.wire.rotation.y = t * 0.12;
    group.userData.wire.rotation.x = Math.sin(t * 0.2) * 0.3;
    for (const p of group.userData.packets) {
      p.userData.a += p.userData.spd * dt;
      const a = p.userData.a;
      p.position.set(Math.cos(a) * p.userData.r, Math.sin(a) * p.userData.r * 0.5, Math.sin(a * 2) * 1.5);
    }
  } };
}

/* ---------- build all sections ---------- */

const BUILDERS = {
  hero: buildHero,
  problem: buildProblem,
  packet: buildPacket,
  layers: buildLayers,
  multipath: buildMultipath,
  clock: buildClock,
  slots: buildSlots,
  tiers: buildTiers,
  outro: buildOutro,
};

const CAMERA = {
  hero: [0, 0.6, 16],
  problem: [0, 0, 15.5],
  packet: [0.4, 0, 12.5],
  layers: [0, 0, 15],
  multipath: [0, 0, 15],
  clock: [0, 0.5, 15],
  slots: [0, 0.5, 16],
  tiers: [0, 0, 15],
  outro: [0, 0, 16],
};

const sections = [...document.querySelectorAll('section[data-scene]')];
const built = {};
const st = {};
let activeId = null;

function build(id) {
  const b = BUILDERS[id]();
  b.group.visible = false;
  scene.add(b.group);
  built[id] = b;
  st[id] = { activeAt: 0 };
  return b;
}

/* ---------- scroll handling ---------- */

const railLinks = [...document.querySelectorAll('.rail a')];
const progressBar = document.querySelector('.scroll-progress-bar');

function currentSection() {
  const mid = window.innerHeight * 0.5;
  let best = sections[0], bestScore = Infinity;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    const c = r.top + r.height / 2;
    const d = Math.abs(c - mid);
    if (d < bestScore) { bestScore = d; best = s; }
  }
  return best;
}

function onScroll() {
  const sec = currentSection();
  const id = sec.dataset.scene;
  if (id !== activeId) {
    activeId = id;
    if (!built[id]) build(id);
    for (const k in built) built[k].group.visible = (k === id);
    st[id].activeAt = t;
    for (const l of railLinks) l.classList.toggle('active', l.dataset.nav === id);
  }
  // reveal DOM
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    const on = r.top < window.innerHeight * 0.85 && r.bottom > window.innerHeight * 0.15;
    s.classList.toggle('inview', on);
  }
  // progress
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  progressBar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
}

/* ---------- main loop ---------- */

let t = 0;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  // ambience
  stars.rotation.y = t * 0.012;

  // active section
  if (activeId && built[activeId]) {
    built[activeId].update(st[activeId], t, dt);
  }

  // camera drift
  const target = CAMERA[activeId] || CAMERA.hero;
  camera.position.x += (target[0] - camera.position.x) * 0.05;
  camera.position.y += (target[1] - camera.position.y) * 0.05;
  camera.position.z += (target[2] - camera.position.z) * 0.05;
  camera.lookAt(0, 0, 0);

  composer.render();
}

/* ---------- resize ---------- */

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onResize);
window.addEventListener('load', onScroll);

// boot
build('hero');
activeId = 'hero';
st.hero.activeAt = 0;
built.hero.group.visible = true;
onScroll();
frame();

window.__robReady = true;
