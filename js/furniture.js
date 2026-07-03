// Generador paramétrico de muebles. Todas las medidas en mm.
// Origen: centro del mueble a nivel de piso. Y hacia arriba, frente hacia +Z.
//
// Cada pieza: {
//   nombre, size:[sx,sy,sz], pos:[x,y,z], explode:[dx,dy,dz],
//   veta: 'v'|'h'   (orientación de la veta en el frente visible)
//   largo, ancho, esp  (dimensiones de corte; largo va con la veta)
//   esLamina: bool  (si entra en el plano de corte de lámina principal)
// }

function pieza(nombre, size, pos, explode, veta, largo, ancho, esp, esLamina = true) {
  return { nombre, size, pos, explode, veta, largo, ancho, esp, esLamina };
}

export function generarPiezas(p) {
  const { tipo } = p;
  if (tipo === 'mesa') return generarMesa(p);
  return generarGabinete(p); // bajo, alacena, closet, cómoda (cajones por módulo)
}

// ---------- Gabinete genérico: bajo de cocina, alacena, clóset ----------
function generarGabinete(p) {
  const W = p.ancho, H = p.alto, D = p.prof, t = p.espesor;
  const zoc = p.tipo === 'bajo' ? p.zocalo : 0;
  const piezas = [];
  const Wint = W - 2 * t;            // ancho interior
  const Hint = H - zoc - 2 * t;      // alto interior

  // Laterales
  piezas.push(pieza('Lateral', [t, H, D], [-(W - t) / 2, H / 2, 0], [-280, 0, 0], 'v', H, D, t));
  piezas.push(pieza('Lateral', [t, H, D], [(W - t) / 2, H / 2, 0], [280, 0, 0], 'v', H, D, t));

  // Base y tapa
  piezas.push(pieza('Base', [Wint, t, D], [0, zoc + t / 2, 0], [0, -250, 0], 'h', Wint, D, t));
  piezas.push(pieza('Tapa', [Wint, t, D], [0, H - t / 2, 0], [0, 280, 0], 'h', Wint, D, t));

  // Trasera (3 mm)
  piezas.push(pieza('Trasera', [Wint, Hint, 3], [0, zoc + t + Hint / 2, -(D / 2) + 1.5],
    [0, 0, -320], 'v', Hint, Wint, 3, false));

  // Zócalo
  if (zoc > 0) {
    piezas.push(pieza('Zócalo', [Wint, zoc, t], [0, zoc / 2, D / 2 - t / 2 - 40], [0, 0, 240], 'h', Wint, zoc, t));
  }

  // Cada MÓDULO es independiente: tiene sus propios entrepaños, subdivisiones,
  // puertas y CAJONES — todo atado al ancho/alto de ese módulo.
  // El número de módulos = divisiones + 1. p.modulos define cada uno.
  const modulos = (p.modulos && p.modulos.length)
    ? p.modulos
    : [{ entrepanos: p.entrepanos ?? 1, subdiv: p.subdiv ?? 0, puertas: p.puertas ?? 0, cajones: p.cajones ?? 0 }];
  const nSec = modulos.length;
  const nDiv = nSec - 1;

  // Ancho de cada módulo: si cfg.ancho > 0 es FIJO (el usuario lo definió);
  // los demás reparten parejo el espacio restante. Así se mueven los
  // laterales internos a la medida exacta que se quiera.
  const espacioTotal = Wint - nDiv * t;
  let sumaFijos = 0, nAuto = 0;
  for (const m of modulos) { if (m.ancho > 0) sumaFijos += m.ancho; else nAuto++; }
  const anchoAuto = nAuto > 0 ? Math.max(50, (espacioTotal - sumaFijos) / nAuto) : 0;
  const anchos = modulos.map(m => (m.ancho > 0 ? m.ancho : anchoAuto));

  // Posición del borde izquierdo interior de cada módulo (acumulada)
  const x0s = [];
  let cursor = -Wint / 2;
  for (let k = 0; k < nSec; k++) {
    x0s.push(cursor);
    cursor += anchos[k];
    if (k < nDiv) cursor += t; // espesor del lateral interno
  }

  // Alto efectivo de cada módulo (independiente; 0 = auto = alto interior)
  const hMods = modulos.map(m => (m.alto > 0 ? Math.min(m.alto, Hint) : Hint));

  // Divisiones verticales (laterales internos) entre módulos. Cada lateral
  // interno es INDEPENDIENTE: su altura es la del módulo más alto que separa,
  // no siempre el alto total del mueble.
  for (let i = 0; i < nDiv; i++) {
    const cx = x0s[i] + anchos[i] + t / 2;
    const hLat = Math.max(hMods[i], hMods[i + 1]);
    piezas.push(pieza(`Lateral interno ${i + 1}`, [t, hLat, D - 20], [cx, zoc + t + hLat / 2, -10],
      [0, 0, 300], 'v', hLat, D - 20, t));
  }

  // Por cada módulo: su interior y su frente (puertas o cajones)
  for (let k = 0; k < nSec; k++) {
    const cfg = modulos[k];
    const cajones = Math.max(0, Math.min(8, cfg.cajones ?? 0));
    const anchoSec = anchos[k];
    const x0 = x0s[k];
    const cxSec = x0 + anchoSec / 2;
    const letra = String.fromCharCode(65 + k);     // A, B, C…
    const nom = nSec > 1 ? ` ${letra}` : '';
    const ezBase = (k - (nSec - 1) / 2) * 80;

    // Alto efectivo del módulo: si cfg.alto > 0 es FIJO (menor que el interior);
    // si no, ocupa todo el alto interior. Su contenido se distribuye dentro.
    const hMod = (cfg.alto > 0) ? Math.min(cfg.alto, Hint) : Hint;

    if (cajones > 0) {
      // Banco de cajones: ocupa el alto del módulo, atado a anchoSec
      generarCajones(piezas, { cxSec, anchoSec, zoc, H: zoc + 2 * t + hMod, D, t, n: cajones, nom });
      if (hMod < Hint - 1) {
        piezas.push(pieza(`Tapa módulo${nom}`, [anchoSec, t, D - 20], [cxSec, zoc + t + hMod + t / 2, -10],
          [ezBase, 0, 260], 'h', anchoSec, D - 20, t));
      }
      continue; // un módulo de cajones no lleva entrepaños ni puertas
    }

    // Tapa de cierre del módulo cuando su alto es menor que el interior
    if (hMod < Hint - 1) {
      piezas.push(pieza(`Tapa módulo${nom}`, [anchoSec, t, D - 20], [cxSec, zoc + t + hMod + t / 2, -10],
        [ezBase, 0, 260], 'h', anchoSec, D - 20, t));
    }

    // Tubo colgador del módulo (accesorio: no sale de la lámina)
    if (cfg.tubo) {
      const yTubo = zoc + t + hMod - 100;
      const tubo = pieza(`Tubo colgador${nom}`, [anchoSec - 40, 25, 25], [cxSec, yTubo, -10],
        [ezBase, 0, 200], 'h', anchoSec - 40, 25, 25, false);
      tubo.accesorio = true;
      piezas.push(tubo);
    }

    // Entrepaños del módulo. Si hay alturas personalizadas (mm desde la base
    // interior) se usan esas; si no, se reparten parejo dentro del alto módulo.
    const n = Math.max(0, Math.min(12, cfg.entrepanos ?? 0));
    const alturas = (cfg.alturasEnt && cfg.alturasEnt.length === n)
      ? cfg.alturasEnt.slice().sort((a, b) => a - b).map(a => Math.min(a, hMod - 1))
      : Array.from({ length: n }, (_, i) => (hMod * (i + 1)) / (n + 1));
    for (let i = 0; i < n; i++) {
      const y = zoc + t + alturas[i];
      piezas.push(pieza(`Entrepaño ${letra}${i + 1}`, [anchoSec, t, D - 20], [cxSec, y, -10],
        [ezBase, 0, 260], 'h', anchoSec, D - 20, t));
    }

    // Bandas entre entrepaños (límites en y, desde la base interior)
    const limites = [0, ...alturas, hMod];

    // Subdivisiones del módulo: separadores verticales (columnas, tipo cava)
    // dentro de cada banda entre entrepaños.
    const nSub = Math.max(0, Math.min(8, cfg.subdiv ?? 0));
    if (nSub > 0) {
      // Posición X de cada separador. Si hay anchos de columna personalizados
      // se usan esos (acumulados); si no, columnas parejas.
      const usaCustom = cfg.anchosSub && cfg.anchosSub.length === nSub + 1;
      const xSeparadores = [];
      if (usaCustom) {
        let cur = x0;
        for (let s = 0; s < nSub; s++) {
          cur += cfg.anchosSub[s];
          xSeparadores.push(cur + t / 2);
          cur += t;
        }
      } else {
        const anchoCelda = (anchoSec - nSub * t) / (nSub + 1);
        if (anchoCelda >= 30) {
          for (let s = 1; s <= nSub; s++) xSeparadores.push(x0 + s * anchoCelda + (s - 0.5) * t);
        }
      }
      let cont = 0; // numeración correlativa de las divisiones internas del módulo
      for (let b = 0; b < limites.length - 1; b++) {
        const abajo = zoc + t + limites[b] + (b === 0 ? 0 : t / 2);
        const arriba = zoc + t + limites[b + 1] - (b === limites.length - 2 ? 0 : t / 2);
        const hBanda = arriba - abajo;
        if (hBanda < 40) continue;
        for (const cx of xSeparadores) {
          cont++;
          piezas.push(pieza(`División int. ${letra}${cont}`, [t, hBanda, D - 20],
            [cx, (abajo + arriba) / 2, -10], [0, 0, 330], 'v', hBanda, D - 20, t));
        }
      }
    }

    // Puertas del módulo (atadas al ancho del módulo)
    const nP = Math.max(0, Math.min(2, cfg.puertas ?? 0));
    if (nP > 0) {
      const gap = 3;
      const doorH = (hMod + t) - 2 * gap; // la puerta cubre el alto del módulo
      const doorW = (anchoSec - (nP + 1) * gap) / nP;
      for (let i = 0; i < nP; i++) {
        const x = cxSec + (nP === 1 ? 0 : (i === 0 ? -1 : 1) * (doorW + gap) / 2);
        const ex = nP === 1 ? ezBase : (i === 0 ? -180 : 180);
        const puerta = pieza(`Puerta${nom}`, [doorW, doorH, t], [x, zoc + gap + doorH / 2, D / 2 + t / 2 + 1],
          [ex, 0, 380], 'v', doorH, doorW, t);
        const lado = (p.apertura === 'arriba' || p.apertura === 'abajo')
          ? p.apertura
          : (nP === 1 || i === 0 ? 'izq' : 'der');
        puerta.anim = { tipo: 'puerta', lado };
        piezas.push(puerta);
      }
    }
  }
  return piezas;
}

// Banco de cajones dentro de un módulo. Cada cajón se ve LIMPIO y CERRADO:
// el frente queda al ras de la cara del módulo y la caja (tray) va escondida
// justo detrás, sin sobresalir. Solo se desliza hacia adelante al abrirlo.
function generarCajones(piezas, { cxSec, anchoSec, zoc, H, D, t, n, nom }) {
  const gap = 3;
  const hFrente = (H - zoc - (n + 1) * gap) / n;
  const dCaja = D - 90;                 // fondo de la caja (queda detrás)
  const wInt = anchoSec - 4;            // hueco interno del módulo
  const zFrente = D / 2 + t / 2 + 1;    // cara frontal del mueble
  const zCaja = zFrente - t - dCaja / 2 - 5; // caja inmediatamente detrás del frente
  for (let i = 0; i < n; i++) {
    const yF = zoc + gap + i * (hFrente + gap) + hFrente / 2;   // centro del frente
    const hCaja = Math.max(60, hFrente - 30);
    const yC = yF;                       // caja a la misma altura del frente
    const desliz = dCaja * 0.6;
    const cajon = { tipo: 'cajon', desliz };
    const piezasCajon = [
      // Frente visible (la única cara cuando está cerrado)
      pieza(`Frente cajón${nom}`, [anchoSec - 2 * gap, hFrente, t], [cxSec, yF, zFrente],
        [0, 0, 90], 'h', anchoSec - 2 * gap, hFrente, t),
      // Caja: dos costados, trasera y fondo — todos justo detrás del frente
      pieza(`Lateral cajón${nom}`, [t, hCaja, dCaja], [cxSec - (wInt - t) / 2, yC, zCaja], [0, 0, 90], 'h', dCaja, hCaja, t),
      pieza(`Lateral cajón${nom}`, [t, hCaja, dCaja], [cxSec + (wInt - t) / 2, yC, zCaja], [0, 0, 90], 'h', dCaja, hCaja, t),
      pieza(`Trasera cajón${nom}`, [wInt - 2 * t, hCaja, t], [cxSec, yC, zCaja - dCaja / 2 + t / 2],
        [0, 0, 90], 'h', wInt - 2 * t, hCaja, t),
      pieza(`Fondo cajón${nom}`, [wInt - 2 * t, 3, dCaja], [cxSec, yC - hCaja / 2 + 1.5, zCaja],
        [0, 0, 90], 'h', dCaja, wInt - 2 * t, 3, false),
    ];
    for (const pc of piezasCajon) pc.anim = cajon;
    piezas.push(...piezasCajon);
  }
}

// ---------- Mesa ----------
function generarMesa(p) {
  const W = p.ancho, H = p.alto, D = p.prof, t = Math.max(p.espesor, 25);
  const piezas = [];
  const pata = 70, inset = 40;

  piezas.push(pieza('Tapa mesa', [W, t, D], [0, H - t / 2, 0], [0, 300, 0], 'h', W, D, t));

  const px = W / 2 - inset - pata / 2;
  const pz = D / 2 - inset - pata / 2;
  const hPata = H - t;
  [[-px, -pz], [px, -pz], [-px, pz], [px, pz]].forEach(([x, z], i) => {
    piezas.push(pieza('Pata', [pata, hPata, pata], [x, hPata / 2, z],
      [Math.sign(x) * 150, 0, Math.sign(z) * 150], 'v', hPata, pata, pata, false));
  });

  // Faldones frontal y trasero
  const fW = W - 2 * inset - 2 * pata;
  piezas.push(pieza('Faldón', [fW, 100, p.espesor], [0, H - t - 50, pz], [0, 0, 200], 'h', fW, 100, p.espesor));
  piezas.push(pieza('Faldón', [fW, 100, p.espesor], [0, H - t - 50, -pz], [0, 0, -200], 'h', fW, 100, p.espesor));
  return piezas;
}
