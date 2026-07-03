// Materiales procedurales (sin descargas, sin costo): texturas de madera
// generadas en canvas. Cada preset produce dos texturas, veta vertical y
// horizontal, para orientar la veta según la pieza.
import * as THREE from 'three';

export const PRESETS = [
  { id: 'roble',    nombre: 'Roble',           base: '#b98c5a', veta: '#8a6238', intensidad: .55 },
  { id: 'cedro',    nombre: 'Cedro',           base: '#a96f43', veta: '#7c4a26', intensidad: .5  },
  { id: 'wengue',   nombre: 'Wengué',          base: '#4a3527', veta: '#2e1f15', intensidad: .65 },
  { id: 'blanca',   nombre: 'Melamina blanca', base: '#f0ede8', veta: '#e2ded7', intensidad: .15 },
  { id: 'gris',     nombre: 'Melamina gris',   base: '#9b9b9b', veta: '#8a8a8a', intensidad: .15 },
  { id: 'mdf',      nombre: 'MDF crudo',       base: '#c9a876', veta: '#bd9c6a', intensidad: .1  },
];

function dibujarVeta(ctx, S, preset) {
  ctx.fillStyle = preset.base;
  ctx.fillRect(0, 0, S, S);
  const lineas = 90;
  for (let i = 0; i < lineas; i++) {
    const x = (i / lineas) * S + (Math.random() - .5) * 8;
    const amp = 4 + Math.random() * 14;
    const fase = Math.random() * Math.PI * 2;
    ctx.strokeStyle = preset.veta;
    ctx.globalAlpha = preset.intensidad * (0.25 + Math.random() * 0.75);
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    for (let y = 0; y <= S; y += 8) {
      const dx = Math.sin(y / 70 + fase) * amp;
      y === 0 ? ctx.moveTo(x + dx, y) : ctx.lineTo(x + dx, y);
    }
    ctx.stroke();
  }
  // Nudos ocasionales
  ctx.globalAlpha = preset.intensidad * .8;
  for (let i = 0; i < 3; i++) {
    const cx = Math.random() * S, cy = Math.random() * S;
    for (let r = 14; r > 2; r -= 3) {
      ctx.strokeStyle = preset.veta;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function crearTextura(preset, horizontal) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  if (horizontal) {
    ctx.translate(S / 2, S / 2);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-S / 2, -S / 2);
  }
  dibujarVeta(ctx, S, preset);
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

const cache = new Map();

// Devuelve { v: MeshStandardMaterial, h: MeshStandardMaterial } por preset.
export function obtenerMateriales(presetId) {
  if (cache.has(presetId)) return cache.get(presetId);
  const preset = PRESETS.find(p => p.id === presetId) ?? PRESETS[0];
  const mk = (horizontal) => new THREE.MeshStandardMaterial({
    map: crearTextura(preset, horizontal),
    roughness: 0.72,
    metalness: 0.02,
  });
  const mats = { v: mk(false), h: mk(true) };
  cache.set(presetId, mats);
  return mats;
}

// Miniatura para el selector de materiales.
export function crearSwatchCanvas(preset) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.save();
  dibujarVeta(ctx, 128, preset);
  ctx.restore();
  return cv;
}
