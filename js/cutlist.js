// Despiece y optimización de corte de láminas.
// La veta de la lámina corre a lo largo (eje del "largo" de la lámina),
// así que las piezas se colocan SIN rotar: largo de pieza sobre largo de lámina.
// Todos los cortes descuentan el grosor de la cuchilla (kerf).

// Agrupa piezas idénticas para la tabla de despiece, con área por fila.
export function agruparDespiece(piezas) {
  const mapa = new Map();
  for (const pz of piezas) {
    const largo = Math.round(pz.largo), ancho = Math.round(pz.ancho);
    const clave = `${pz.nombre}|${largo}|${ancho}|${pz.esp}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, { nombre: pz.nombre, cant: 0, largo, ancho, esp: pz.esp, veta: pz.veta, esLamina: pz.esLamina });
    }
    mapa.get(clave).cant++;
  }
  const filas = [...mapa.values()];
  for (const f of filas) {
    f.areaUnit = (f.largo * f.ancho) / 1e6;       // m² por pieza
    f.areaTotal = f.areaUnit * f.cant;            // m² de la fila
    f.cantoUnit = 2 * (f.largo + f.ancho) / 1000; // m de canto perimetral por pieza
    f.cantoTotal = f.cantoUnit * f.cant;
  }
  return filas.sort((a, b) => b.largo * b.ancho - a.largo * a.ancho);
}

// Empaquetado tipo "estantes" (shelf packing) respetando la veta y el kerf.
// Devuelve métricas completas de consumo de tablero.
export function optimizarCorte(piezas, laminaL, laminaA, kerf) {
  const items = [];
  for (const pz of piezas) {
    if (!pz.esLamina) continue;
    items.push({ nombre: pz.nombre, w: Math.round(pz.largo), h: Math.round(pz.ancho) });
  }
  // Mayor ancho primero para formar filas eficientes
  items.sort((a, b) => b.h - a.h || b.w - a.w);

  const laminas = [];
  const sinCaber = [];

  const nuevaLamina = () => {
    const lam = { rects: [], filas: [], yUsado: 0 };
    laminas.push(lam);
    return lam;
  };

  for (const it of items) {
    let w = it.w, h = it.h;
    if (w > laminaL || h > laminaA) {
      // Intento girando 90° (sacrifica veta) antes de descartar
      if (h <= laminaL && w <= laminaA) [w, h] = [h, w];
      else { sinCaber.push(`${it.nombre} ${it.w}×${it.h}`); continue; }
    }
    let colocada = false;
    for (const lam of laminas.length ? laminas : [nuevaLamina()]) {
      // Buscar fila existente donde quepa
      for (const fila of lam.filas) {
        if (h <= fila.alto && fila.xUsado + w <= laminaL) {
          lam.rects.push({ x: fila.xUsado, y: fila.y, w, h, nombre: it.nombre });
          fila.xUsado += w + kerf;
          colocada = true;
          break;
        }
      }
      if (colocada) break;
      // Nueva fila en esta lámina
      if (lam.yUsado + h <= laminaA) {
        lam.filas.push({ y: lam.yUsado, alto: h, xUsado: w + kerf });
        lam.rects.push({ x: 0, y: lam.yUsado, w, h, nombre: it.nombre });
        lam.yUsado += h + kerf;
        colocada = true;
        break;
      }
    }
    if (!colocada) {
      const lam = nuevaLamina();
      lam.filas.push({ y: 0, alto: h, xUsado: w + kerf });
      lam.rects.push({ x: 0, y: 0, w, h, nombre: it.nombre });
      lam.yUsado = h + kerf;
    }
  }

  // ----- Métricas de consumo -----
  const areaLamina = laminaL * laminaA;            // mm²
  let areaUsada = 0;
  let longitudCorte = 0;                           // mm lineales de cuchilla
  for (const lam of laminas) {
    for (const r of lam.rects) areaUsada += r.w * r.h;
    // Cortes reales: un traversal por fila (largo = laminaL) + un corte
    // de despiece por pieza (alto de la fila). Aproxima el trabajo de sierra.
    for (const fila of lam.filas) {
      longitudCorte += laminaL;                    // corte transversal de la fila
      const piezasFila = lam.rects.filter(r => r.y === fila.y).length;
      longitudCorte += fila.alto * piezasFila;     // cortes de despiece verticales
    }
  }
  const nLam = laminas.length;
  const areaTotalLam = nLam * areaLamina;
  const aprovechamiento = nLam ? (areaUsada / areaTotalLam) * 100 : 0;

  return {
    laminas,
    sinCaber,
    aprovechamiento,
    nLaminas: nLam,
    areaPiezas: areaUsada / 1e6,                   // m² netos de piezas
    areaLaminas: areaTotalLam / 1e6,               // m² de tableros comprados
    areaDesperdicio: (areaTotalLam - areaUsada) / 1e6,
    longitudCorte: longitudCorte / 1000,           // metros lineales de corte
    kerf,
  };
}

// Dibuja cada lámina en un canvas, con cotas de cada pieza.
export function dibujarPlanos(resultado, laminaL, laminaA, contenedor) {
  contenedor.innerHTML = '';
  const escala = 600 / laminaL;
  resultado.laminas.forEach((lam, idx) => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(laminaL * escala);
    cv.height = Math.round(laminaA * escala);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0e0c0a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = '#5a4a35';
    ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);

    const colores = ['#e8a33d', '#7fb069', '#5fa8d3', '#c97f9d', '#b5838d', '#8d99ae'];
    lam.rects.forEach((r, i) => {
      const x = r.x * escala, y = r.y * escala, w = r.w * escala, h = r.h * escala;
      ctx.fillStyle = colores[i % colores.length] + '33';
      ctx.strokeStyle = colores[i % colores.length];
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#ece5dc';
      ctx.font = `${Math.max(9, Math.min(13, h / 4))}px sans-serif`;
      const texto = `${r.nombre} ${r.w}×${r.h}`;
      if (w > 60 && h > 18) ctx.fillText(texto, x + 4, y + Math.min(h - 5, 16), w - 8);
    });

    const usada = lam.rects.reduce((s, r) => s + r.w * r.h, 0);
    const aprov = (usada / (laminaL * laminaA)) * 100;
    const titulo = document.createElement('div');
    titulo.className = 'resumen';
    titulo.innerHTML = `<b>Lámina ${idx + 1}</b> — ${laminaL} × ${laminaA} mm — ` +
      `${lam.rects.length} piezas — aprov. ${aprov.toFixed(0)}%`;
    contenedor.appendChild(titulo);
    contenedor.appendChild(cv);
  });
}
