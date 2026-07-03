// Íconos vectoriales de carpintería para Florenza V.
// Cada función dibuja un símbolo dentro de un cuadro de lado `s` en el contexto
// 2D dado, con la esquina en (x,y). Se usan tanto en el panel del PC (canvas
// pequeño junto a cada campo) como en los botones 3D de la realidad mixta.
// Estilo: line-art grueso y legible (recomendación VR: trazos gruesos, sin
// detalles finos). El color por defecto es el dorado de la marca.

function base(ctx, x, y, s, color, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw ?? Math.max(2, s * 0.07);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}
const caja = (ctx, s, m = 0.14) => {
  const a = s * m, b = s * (1 - m);
  ctx.strokeRect(a, a, b - a, b - a);
  return { a, b, w: b - a };
};

// Diccionario de dibujantes. Reciben (ctx, s).
export const ICONOS = {
  // Estante horizontal: caja con repisas
  entrepano(ctx, s) {
    const { a, b } = caja(ctx, s);
    for (let i = 1; i <= 2; i++) {
      const y = a + (b - a) * (i / 3);
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
    }
  },
  // División vertical (módulos / laterales internos)
  division(ctx, s) {
    const { a, b } = caja(ctx, s);
    const x = (a + b) / 2;
    ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.stroke();
  },
  // Subdivisiones: cuadrícula de celdas (cava)
  subdivision(ctx, s) {
    const { a, b } = caja(ctx, s);
    for (let i = 1; i <= 2; i++) {
      const x = a + (b - a) * (i / 3);
      ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.stroke();
    }
    const y = (a + b) / 2;
    ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
  },
  // Módulo: caja con una columna resaltada
  modulo(ctx, s) {
    const { a, b, w } = caja(ctx, s);
    const x1 = a + w / 3, x2 = a + 2 * w / 3;
    ctx.beginPath(); ctx.moveTo(x1, a); ctx.lineTo(x1, b);
    ctx.moveTo(x2, a); ctx.lineTo(x2, b); ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x1, a, x2 - x1, b - a);
    ctx.globalAlpha = 1;
  },
  // Puerta: caja con bisagra (línea izq) y manija (punto der)
  puerta(ctx, s) {
    const { a, b } = caja(ctx, s);
    ctx.beginPath(); ctx.moveTo(a, a); ctx.lineTo(a, b); ctx.stroke();
    ctx.beginPath(); ctx.arc(b - s * 0.1, (a + b) / 2, s * 0.04, 0, 7); ctx.fill();
  },
  // Cajón: frente con tirador horizontal
  cajon(ctx, s) {
    const { a, b } = caja(ctx, s);
    const y = a + (b - a) * 0.32;
    ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
    ctx.lineWidth *= 1.4;
    ctx.beginPath(); ctx.moveTo((a + b) / 2 - s * 0.12, a + (b - a) * 0.16);
    ctx.lineTo((a + b) / 2 + s * 0.12, a + (b - a) * 0.16); ctx.stroke();
  },
  // Ancho ↔
  ancho(ctx, s) {
    const y = s / 2, a = s * 0.16, b = s * 0.84;
    ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
    flecha(ctx, a, y, -1, 0, s); flecha(ctx, b, y, 1, 0, s);
  },
  // Alto ↕
  alto(ctx, s) {
    const x = s / 2, a = s * 0.16, b = s * 0.84;
    ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.stroke();
    flecha(ctx, x, a, 0, -1, s); flecha(ctx, x, b, 0, 1, s);
  },
  // Profundidad ⤢ (diagonal)
  prof(ctx, s) {
    const a = s * 0.22, b = s * 0.78;
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(b, a); ctx.stroke();
    flecha(ctx, a, b, -0.7, 0.7, s); flecha(ctx, b, a, 0.7, -0.7, s);
  },
  // Espesor: dos líneas con cota
  espesor(ctx, s) {
    const a = s * 0.32, b = s * 0.68, y1 = s * 0.2, y2 = s * 0.8;
    ctx.beginPath(); ctx.moveTo(a, y1); ctx.lineTo(a, y2);
    ctx.moveTo(b, y1); ctx.lineTo(b, y2); ctx.stroke();
    ctx.lineWidth *= 0.7;
    ctx.beginPath(); ctx.moveTo(a, s / 2); ctx.lineTo(b, s / 2); ctx.stroke();
  },
  // Zócalo: caja con base gruesa
  zocalo(ctx, s) {
    const { a, b } = caja(ctx, s);
    ctx.fillRect(a, b - s * 0.14, b - a, s * 0.14);
  },
  // Material: vetas de madera
  material(ctx, s) {
    const { a, b } = caja(ctx, s);
    ctx.save();
    ctx.beginPath(); ctx.rect(a, a, b - a, b - a); ctx.clip();
    ctx.lineWidth *= 0.6;
    for (let i = 0; i < 4; i++) {
      const y = a + (b - a) * (i + 0.5) / 4;
      ctx.beginPath();
      ctx.moveTo(a, y);
      ctx.bezierCurveTo(a + (b - a) * 0.3, y - s * 0.04, a + (b - a) * 0.6, y + s * 0.04, b, y);
      ctx.stroke();
    }
    ctx.restore();
  },
  // Escala: flechas diagonales expandiendo
  escala(ctx, s) {
    const a = s * 0.22, b = s * 0.78;
    ctx.beginPath(); ctx.moveTo(a, a); ctx.lineTo(b, b); ctx.stroke();
    flecha(ctx, a, a, -0.7, -0.7, s); flecha(ctx, b, b, 0.7, 0.7, s);
  },
  // Girar: flecha circular
  girar(ctx, s) {
    const c = s / 2, r = s * 0.3;
    ctx.beginPath(); ctx.arc(c, c, r, Math.PI * 0.4, Math.PI * 2); ctx.stroke();
    flecha(ctx, c + r * Math.cos(Math.PI * 0.4), c + r * Math.sin(Math.PI * 0.4), -0.9, 0.4, s);
  },
  // Frente: ojo mirando (lo que ves)
  frente(ctx, s) {
    const c = s / 2;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, c);
    ctx.quadraticCurveTo(c, s * 0.22, s * 0.82, c);
    ctx.quadraticCurveTo(c, s * 0.78, s * 0.18, c);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, s * 0.1, 0, 7); ctx.fill();
  },
  // Mover: cruz de 4 flechas
  mover(ctx, s) {
    const c = s / 2, a = s * 0.18, b = s * 0.82;
    ctx.beginPath(); ctx.moveTo(c, a); ctx.lineTo(c, b);
    ctx.moveTo(a, c); ctx.lineTo(b, c); ctx.stroke();
    flecha(ctx, c, a, 0, -1, s); flecha(ctx, c, b, 0, 1, s);
    flecha(ctx, a, c, -1, 0, s); flecha(ctx, b, c, 1, 0, s);
  },
  // Subir/bajar
  altura(ctx, s) {
    const x = s / 2, a = s * 0.18, b = s * 0.82;
    ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.stroke();
    flecha(ctx, x, a, 0, -1, s); flecha(ctx, x, b, 0, 1, s);
    ctx.lineWidth *= 0.6;
    ctx.beginPath(); ctx.moveTo(s * 0.3, b); ctx.lineTo(s * 0.7, b); ctx.stroke();
  },
  // Piso: mueble sobre línea de suelo
  piso(ctx, s) {
    const { a, b } = caja(ctx, s, 0.22);
    ctx.lineWidth *= 1.4;
    ctx.beginPath(); ctx.moveTo(s * 0.1, b + s * 0.06); ctx.lineTo(s * 0.9, b + s * 0.06); ctx.stroke();
  },
  // Pared: mueble contra línea vertical
  pared(ctx, s) {
    const a = s * 0.3, b = s * 0.86;
    ctx.strokeRect(a, s * 0.2, b - a, s * 0.6);
    ctx.lineWidth *= 1.4;
    ctx.beginPath(); ctx.moveTo(s * 0.14, s * 0.12); ctx.lineTo(s * 0.14, s * 0.88); ctx.stroke();
  },
  // 4 puntos: esquinas marcadas
  puntos(ctx, s) {
    const a = s * 0.22, b = s * 0.78, r = s * 0.06;
    for (const [px, py] of [[a, a], [b, a], [a, b], [b, b]]) {
      ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    }
  },
  // Mueble (armario)
  mueble(ctx, s) {
    const { a, b } = caja(ctx, s, 0.16);
    const x = (a + b) / 2;
    ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - s * 0.06, (a + b) / 2, s * 0.03, 0, 7);
    ctx.arc(x + s * 0.06, (a + b) / 2, s * 0.03, 0, 7); ctx.fill();
  },
  // Añadir +
  anadir(ctx, s) {
    const c = s / 2, r = s * 0.26;
    ctx.lineWidth *= 1.2;
    ctx.beginPath(); ctx.moveTo(c - r, c); ctx.lineTo(c + r, c);
    ctx.moveTo(c, c - r); ctx.lineTo(c, c + r); ctx.stroke();
  },
  // Eliminar (papelera)
  eliminar(ctx, s) {
    const a = s * 0.28, b = s * 0.72;
    ctx.beginPath(); ctx.moveTo(a, s * 0.32); ctx.lineTo(s * 0.32, s * 0.8);
    ctx.lineTo(s * 0.68, s * 0.8); ctx.lineTo(b, s * 0.32); ctx.stroke();
    ctx.lineWidth *= 0.9;
    ctx.beginPath(); ctx.moveTo(s * 0.22, s * 0.3); ctx.lineTo(s * 0.78, s * 0.3); ctx.stroke();
  },
  // Despiece (lista)
  lista(ctx, s) {
    const a = s * 0.22, b = s * 0.8;
    for (let i = 0; i < 3; i++) {
      const y = s * 0.3 + i * s * 0.18;
      ctx.beginPath(); ctx.arc(a, y, s * 0.03, 0, 7); ctx.fill();
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath(); ctx.moveTo(a + s * 0.1, y); ctx.lineTo(b, y); ctx.stroke();
    }
  },
};

// Punta de flecha en (x,y) apuntando en dirección (dx,dy) normalizada
function flecha(ctx, x, y, dx, dy, s) {
  const l = s * 0.12, ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - l * Math.cos(ang - 0.5), y - l * Math.sin(ang - 0.5));
  ctx.moveTo(x, y);
  ctx.lineTo(x - l * Math.cos(ang + 0.5), y - l * Math.sin(ang + 0.5));
  ctx.stroke();
}

// Dibuja un ícono y devuelve el contexto a su estado previo.
export function dibujarIcono(ctx, tipo, x, y, s, color = '#e8a33d', lw) {
  if (!ICONOS[tipo]) return;
  base(ctx, x, y, s, color, lw);
  ICONOS[tipo](ctx, s);
  ctx.restore();
}

// Crea un <canvas> con el ícono (para insertar en el HTML del PC).
export function iconoCanvas(tipo, px = 22, color = '#e8a33d') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px * 2; // x2 para nitidez
  const ctx = cv.getContext('2d');
  dibujarIcono(ctx, tipo, 0, 0, px * 2, color);
  cv.style.width = cv.style.height = px + 'px';
  cv.className = 'ico';
  return cv;
}

// Devuelve una THREE.CanvasTexture con el ícono (para botones XR).
export function iconoTextura(THREE, tipo, px = 96, color = '#ece5dc') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  dibujarIcono(ctx, tipo, 0, 0, px, color);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
