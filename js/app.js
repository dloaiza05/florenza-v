import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { PRESETS, obtenerMateriales, crearSwatchCanvas } from './materials.js';
import { generarPiezas } from './furniture.js';
import { agruparDespiece, optimizarCorte, dibujarPlanos } from './cutlist.js';
import { iconoCanvas, dibujarIcono } from './icons.js';
import { PLANTILLAS } from './biblioteca.js';

// ============================== Estado ==============================
const $ = (id) => document.getElementById(id);
let materialActual = 'roble';
let factorEnsamblaje = 1;   // 0 = explosionado, 1 = armado
let cajonesEstados = [];    // estado de apertura por cajón {f, objetivo}
let escalaMueble = 1;       // escala visual en AR (1 = tamaño real)
let muebleGroup = null;     // grupo con las piezas actuales
let piezasInfo = [];        // datos de cada pieza para slider/despiece
let animPuertas = [];       // pivotes de puertas {obj, eje, signo, max}
let dimsAct = { ancho: 800, alto: 900, prof: 550 }; // caché para AR
// Cada módulo (sección entre divisiones) es INDEPENDIENTE: sus propios
// entrepaños y subdivisiones. modulosConfig[i] = { entrepanos, subdiv }.
let modulosConfig = [{ entrepanos: 0, subdiv: 0, puertas: 0, cajones: 0, tubo: 0 }];
let moduloSel = 0;          // 0 = todos los módulos; 1..N = un módulo concreto

const suaviza = (t) => t * t * (3 - 2 * t);

// ============================== Escena ==============================
const canvas = $('c3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1714);

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 50);
camera.position.set(1.6, 1.4, 2.2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;

// Luces: una hemisférica suave + una direccional con sombra
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x44372a, 1.1));
const sol = new THREE.DirectionalLight(0xffffff, 1.6);
sol.position.set(2.5, 4, 2);
sol.castShadow = true;
sol.shadow.mapSize.set(1024, 1024);
sol.shadow.camera.left = sol.shadow.camera.bottom = -2.5;
sol.shadow.camera.right = sol.shadow.camera.top = 2.5;
scene.add(sol);

// Piso y rejilla (se ocultan en AR)
const entornoPC = new THREE.Group();
const piso = new THREE.Mesh(
  new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x22201c, roughness: 0.95 })
);
piso.receiveShadow = true;
entornoPC.add(piso);
const grid = new THREE.GridHelper(8, 32, 0x4a4036, 0x2e2922);
grid.position.y = 0.001;
entornoPC.add(grid);
scene.add(entornoPC);

// Tamaño según contenedor
const viewport = $('viewport');
function ajustarTamano() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(ajustarTamano).observe(viewport);
ajustarTamano();

// ============================== Construcción del mueble ==============================
function leerParametros() {
  return {
    tipo: $('tipo').value,
    ancho: +$('ancho').value,
    alto: +$('alto').value,
    prof: +$('prof').value,
    espesor: +$('espesor').value,
    divisiones: +$('divisiones').value,
    puertas: +$('puertas').value,
    cajones: +$('cajones').value,
    zocalo: +$('zocalo').value,
    apertura: $('apertura').value,
    modulos: modulosConfig.map(m => ({ ...m })),
  };
}

// Un módulo NUEVO nace VACÍO: sin puertas, cajones, entrepaños ni accesorios.
// El usuario agrega lo que quiera en cada módulo de forma independiente.
const moduloDefault = () => ({ ancho: 0, alto: 0, entrepanos: 0, alturasEnt: [], subdiv: 0, anchosSub: [], puertas: 0, cajones: 0, tubo: 0 });

// Alto interior del mueble (mm), donde van los entrepaños
function altoInterior() {
  const t = +$('espesor').value;
  const zoc = $('tipo').value === 'bajo' ? +$('zocalo').value : 0;
  return (+$('alto').value) - zoc - 2 * t;
}

// Alturas repartidas parejo para n entrepaños (mm desde la base interior)
function repartirAlturas(n) {
  const Hint = altoInterior();
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push(Math.round((Hint * i) / (n + 1)));
  return arr;
}

// Ancho interior del módulo idx (mm) — replica el reparto de furniture.js
function anchoModuloInterior(idx) {
  const t = +$('espesor').value;
  const Wint = (+$('ancho').value) - 2 * t;
  const nSec = modulosConfig.length, nDiv = nSec - 1;
  const espacioTotal = Wint - nDiv * t;
  let sumaFijos = 0, nAuto = 0;
  for (const m of modulosConfig) { if (m.ancho > 0) sumaFijos += m.ancho; else nAuto++; }
  const anchoAuto = nAuto > 0 ? Math.max(50, (espacioTotal - sumaFijos) / nAuto) : 0;
  const m = modulosConfig[idx];
  return Math.round(m && m.ancho > 0 ? m.ancho : anchoAuto);
}

// Anchos de las (nSub+1) columnas repartidos parejo en el ancho del módulo
function repartirAnchosSub(nSub, anchoMod) {
  const t = +$('espesor').value;
  const util = anchoMod - nSub * t;       // descontando el grosor de separadores
  const w = Math.round(util / (nSub + 1));
  return Array.from({ length: nSub + 1 }, () => w);
}

// Mantiene modulosConfig con (divisiones + 1) módulos, conservando los que ya
// existían. Reconstruye el selector de módulos y refresca los inputs.
function sincronizarModulos() {
  const nSec = (+$('divisiones').value) + 1;
  while (modulosConfig.length < nSec) modulosConfig.push(moduloDefault());
  if (modulosConfig.length > nSec) modulosConfig.length = nSec;
  // Normaliza por compatibilidad con proyectos viejos
  for (const m of modulosConfig) {
    m.ancho ??= 0; m.alto ??= 0; m.entrepanos ??= 0; m.alturasEnt ??= []; m.subdiv ??= 0; m.anchosSub ??= []; m.puertas ??= 0; m.cajones ??= 0; m.tubo ??= 0;
  }
  if (moduloSel > nSec) moduloSel = 0;

  // Ancho real de cada módulo, recalculado con las medidas actuales
  const t = +$('espesor').value;
  const Wint = (+$('ancho').value) - 2 * t;
  const nDiv = nSec - 1;
  // Ancho REAL de cada módulo: los fijos usan su valor; el resto reparte
  const espacio = Wint - nDiv * t;
  let fijos = 0, nAuto = 0;
  for (const mm of modulosConfig) { if (mm.ancho > 0) fijos += mm.ancho; else nAuto++; }
  const anchoAuto = nAuto > 0 ? Math.max(50, Math.round((espacio - fijos) / nAuto)) : 0;

  const sel = $('modulo');
  if (sel) {
    const prev = moduloSel;
    sel.innerHTML = `<option value="0">Todos los módulos</option>` +
      modulosConfig.map((mm, i) =>
        `<option value="${i + 1}">Módulo ${String.fromCharCode(65 + i)} — ${mm.ancho > 0 ? mm.ancho : anchoAuto} mm</option>`).join('');
    sel.value = String(prev);
  }
  reflejarModuloEnInputs();
}

// Muestra en los inputs los valores del módulo seleccionado
function reflejarModuloEnInputs() {
  const ref = moduloSel === 0 ? modulosConfig[0] : modulosConfig[moduloSel - 1];
  if (!ref) return;
  if ($('entrepanos')) $('entrepanos').value = ref.entrepanos;
  if ($('subdiv')) $('subdiv').value = ref.subdiv;
  // Ancho/alto fijos solo aplican a un módulo concreto (en "Todos" = 0 = auto)
  if ($('anchoMod')) $('anchoMod').value = moduloSel === 0 ? 0 : (ref.ancho || 0);
  if ($('altoMod')) $('altoMod').value = moduloSel === 0 ? 0 : (ref.alto || 0);
  if ($('puertas')) $('puertas').value = ref.puertas;
  if ($('cajones')) $('cajones').value = ref.cajones;
  if ($('tubo')) $('tubo').value = ref.tubo;
  renderAlturasEntrepanos();
  renderAnchosSub();
}

// Escribe entrepaños/subdiv/puertas/cajones en el módulo seleccionado (o todos)
function aplicarAModulo() {
  const v = {
    entrepanos: Math.max(0, Math.min(12, +$('entrepanos').value)),
    subdiv: Math.max(0, Math.min(8, +$('subdiv').value)),
    puertas: Math.max(0, Math.min(2, +$('puertas').value)),
    cajones: Math.max(0, Math.min(8, +$('cajones').value)),
    tubo: $('tubo') ? Math.max(0, Math.min(1, +$('tubo').value)) : 0,
  };
  // Al cambiar cantidades, regenera las listas individuales repartidas parejo
  const set = (m, idx) => {
    Object.assign(m, v);
    if ((m.alturasEnt?.length || 0) !== v.entrepanos) m.alturasEnt = repartirAlturas(v.entrepanos);
    if (v.subdiv === 0) m.anchosSub = [];
    else if ((m.anchosSub?.length || 0) !== v.subdiv + 1) m.anchosSub = repartirAnchosSub(v.subdiv, anchoModuloInterior(idx));
  };
  if (moduloSel === 0) {
    modulosConfig.forEach((m, i) => set(m, i));
  } else if (modulosConfig[moduloSel - 1]) {
    // Ancho/alto FIJOS solo para el módulo seleccionado (0 = automático)
    if ($('anchoMod')) modulosConfig[moduloSel - 1].ancho = Math.max(0, +$('anchoMod').value);
    if ($('altoMod')) modulosConfig[moduloSel - 1].alto = Math.max(0, +$('altoMod').value);
    set(modulosConfig[moduloSel - 1], moduloSel - 1);
  }
  renderAlturasEntrepanos();
  renderAnchosSub();
}

// Lista dinámica de inputs: una altura por entrepaño del módulo seleccionado
function renderAlturasEntrepanos() {
  const wrap = $('alturasWrap'), cont = $('alturasEntrepanos');
  if (!wrap || !cont) return;
  // Solo cuando hay UN módulo concreto seleccionado y tiene entrepaños
  const m = moduloSel > 0 ? modulosConfig[moduloSel - 1] : null;
  if (!m || !m.entrepanos) { wrap.style.display = 'none'; cont.innerHTML = ''; return; }
  if ((m.alturasEnt?.length || 0) !== m.entrepanos) m.alturasEnt = repartirAlturas(m.entrepanos);
  const Hint = altoInterior();
  wrap.style.display = 'block';
  cont.innerHTML = m.alturasEnt.map((h, i) =>
    `<label>Entrepaño ${i + 1}<input type="number" class="altEnt" data-i="${i}" value="${h}" min="20" max="${Hint - 20}" step="10"></label>`
  ).join('');
  cont.querySelectorAll('.altEnt').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i;
      m.alturasEnt[i] = Math.max(20, Math.min(Hint - 20, +inp.value));
      reconstruir();
    });
  });
}

// Lista dinámica: ancho de cada columna (subdivisión) del módulo seleccionado
function renderAnchosSub() {
  const wrap = $('anchosWrap'), cont = $('anchosSub');
  if (!wrap || !cont) return;
  const m = moduloSel > 0 ? modulosConfig[moduloSel - 1] : null;
  if (!m || !m.subdiv) { wrap.style.display = 'none'; cont.innerHTML = ''; return; }
  const anchoMod = anchoModuloInterior(moduloSel - 1);
  if ((m.anchosSub?.length || 0) !== m.subdiv + 1) m.anchosSub = repartirAnchosSub(m.subdiv, anchoMod);
  wrap.style.display = 'block';
  cont.innerHTML = m.anchosSub.map((w, i) =>
    `<label>Columna ${i + 1}<input type="number" class="anchoSub" data-i="${i}" value="${w}" min="20" max="${anchoMod}" step="10"></label>`
  ).join('');
  cont.querySelectorAll('.anchoSub').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i;
      m.anchosSub[i] = Math.max(20, +inp.value);
      reconstruir();
    });
  });
}

// Pivote de bisagra según el lado de apertura de la puerta
function datosBisagra(pz) {
  const [sx, sy] = pz.size;
  switch (pz.anim.lado) {
    case 'der':    return { off: [sx / 2, 0, 0],  eje: 'y', signo: 1,  max: 1.83 };
    case 'arriba': return { off: [0, sy / 2, 0],  eje: 'x', signo: -1, max: 1.4 };
    case 'abajo':  return { off: [0, -sy / 2, 0], eje: 'x', signo: 1,  max: 1.4 };
    default:       return { off: [-sx / 2, 0, 0], eje: 'y', signo: -1, max: 1.83 }; // izq
  }
}

function reconstruir() {
  const p = leerParametros();
  dimsAct = { ancho: p.ancho, alto: p.alto, prof: p.prof };
  const piezas = generarPiezas(p);
  const mats = obtenerMateriales(materialActual);

  // Conservar posición/rotación (importante en AR: no perder dónde quedó colocado)
  const prevTransform = muebleGroup
    ? { pos: muebleGroup.position.clone(), rotY: muebleGroup.rotation.y }
    : null;
  if (muebleGroup) {
    muebleGroup.traverse(o => o.geometry?.dispose());
    scene.remove(muebleGroup);
  }
  muebleGroup = new THREE.Group();
  muebleGroup.scale.setScalar(0.001 * escalaMueble); // mm → metros (× escala visual)
  if (prevTransform) {
    muebleGroup.position.copy(prevTransform.pos);
    muebleGroup.rotation.y = prevTransform.rotY;
  }
  // Preservar el estado de apertura (puertas/cajones) entre reconstrucciones:
  // así NO se cierran al agregar entrepaños o divisiones.
  const estadoPuertasPrev = animPuertas.map(a => ({ f: a.f, objetivo: a.objetivo }));
  const estadoCajonesPrev = cajonesEstados.map(c => ({ f: c.f, objetivo: c.objetivo }));
  piezasInfo = [];
  animPuertas = [];
  cajonesEstados = [];

  for (const pz of piezas) {
    const geo = new THREE.BoxGeometry(...pz.size);
    const mat = pz.veta === 'h' ? mats.h : mats.v;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;

    let obj = mesh;
    let base = pz.pos;
    let desliz = 0;
    let estadoCajon = null;
    if (pz.anim?.tipo === 'puerta') {
      // La puerta cuelga de un pivote (la bisagra) para poder abrirse.
      // Cada puerta tiene su PROPIO estado: se abre/cierra individualmente.
      const b = datosBisagra(pz);
      const g = new THREE.Group();
      mesh.position.set(-b.off[0], -b.off[1], -b.off[2]);
      g.add(mesh);
      base = [pz.pos[0] + b.off[0], pz.pos[1] + b.off[1], pz.pos[2] + b.off[2]];
      const prev = estadoPuertasPrev[animPuertas.length] || { f: 0, objetivo: 0 };
      const entrada = { obj: g, eje: b.eje, signo: b.signo, max: b.max, f: prev.f, objetivo: prev.objetivo };
      g.userData.puerta = entrada;
      animPuertas.push(entrada);
      obj = g;
    } else if (pz.anim?.tipo === 'cajon') {
      desliz = pz.anim.desliz;
      // Las piezas de un mismo cajón comparten el objeto anim → un estado por cajón
      if (!pz.anim.estado) {
        const prev = estadoCajonesPrev[cajonesEstados.length] || { f: 0, objetivo: 0 };
        pz.anim.estado = { f: prev.f, objetivo: prev.objetivo };
        cajonesEstados.push(pz.anim.estado);
      }
      estadoCajon = pz.anim.estado;
      mesh.userData.cajon = estadoCajon;
    }
    muebleGroup.add(obj);
    piezasInfo.push({ mesh: obj, pos: base, explode: pz.explode, desliz, estadoCajon });
  }
  agregarEtiquetasModulos(p);
  scene.add(muebleGroup);
  aplicarEnsamblaje();
  aplicarPuertas();
  actualizarDespiece(piezas, p);
  $('hudInfo').textContent =
    `${$('tipo').selectedOptions[0].text} — ${p.ancho}×${p.alto}×${p.prof} mm — ${piezas.length} piezas`;
  actualizarPanelInfo();
}

// Letra de cada módulo (A, B, C…) flotando sobre su frente, como referencia
function letraModulo(i) { return String.fromCharCode(65 + i); }

function agregarEtiquetasModulos(p) {
  if (p.tipo === 'mesa' || p.tipo === 'comoda') return;
  const t = p.espesor, W = p.ancho, H = p.alto;
  const Wint = W - 2 * t;
  const nSec = modulosConfig.length;
  if (nSec < 1) return;
  const nDiv = nSec - 1;
  const anchoSec = (Wint - nDiv * t) / nSec;
  for (let k = 0; k < nSec; k++) {
    const cx = -Wint / 2 + k * (anchoSec + t) + anchoSec / 2;
    const { tx } = texturaTexto(letraModulo(k), 128, 128, 'bold 90px sans-serif', '#e8a33d', '#1a130a');
    const placa = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({ map: tx, transparent: true })
    );
    placa.position.set(cx, H - 70, p.prof / 2 + 15);
    muebleGroup.add(placa);
  }
}

function aplicarEnsamblaje() {
  const t = factorEnsamblaje;
  for (const { mesh, pos, explode, desliz, estadoCajon } of piezasInfo) {
    mesh.position.set(
      pos[0] + explode[0] * (1 - t),
      pos[1] + explode[1] * (1 - t),
      pos[2] + explode[2] * (1 - t) + desliz * suaviza(estadoCajon?.f ?? 0)
    );
  }
}

function aplicarPuertas() {
  for (const a of animPuertas) {
    const f = suaviza(a.f);
    if (a.eje === 'y') a.obj.rotation.y = a.signo * a.max * f;
    else a.obj.rotation.x = a.signo * a.max * f;
  }
  aplicarEnsamblaje(); // aplica también el deslizamiento de cajones
}

// Abre o cierra TODO (botón "Puertas", tecla X del mando izquierdo)
function alternarPuertas() {
  const todos = [...animPuertas, ...cajonesEstados];
  if (!todos.length) return;
  const abrir = todos.some(e => e.objetivo === 1) ? 0 : 1;
  for (const e of todos) e.objetivo = abrir;
}

function abrirTodo(abrir) {
  for (const e of [...animPuertas, ...cajonesEstados]) e.objetivo = abrir ? 1 : 0;
}

// Abre/cierra SOLO la puerta o el cajón al que apunta el rayo
function alternarApuntado(ctrl) {
  if (!muebleGroup) return false;
  const hits = rayoDe(ctrl).intersectObject(muebleGroup, true);
  if (!hits.length) return false;
  let o = hits[0].object;
  if (o.userData.cajon) { o.userData.cajon.objetivo ^= 1; return true; }
  while (o && o !== muebleGroup) {
    if (o.userData.puerta) { o.userData.puerta.objetivo ^= 1; return true; }
    o = o.parent;
  }
  return false;
}

// Herrajes según las piezas (estándar de carpintería en melamina):
// - Bisagras de cazoleta por puerta según su alto (regla habitual).
// - Un par de correderas por cajón.
// - Tornillería y tarugos aproximados por uniones del módulo.
function calcularHerrajes(piezas) {
  let bisagras = 0, correderas = 0, estructura = 0, herrajeMontaje = 0;
  for (const pz of piezas) {
    if (/^Puerta/.test(pz.nombre)) {
      const h = pz.largo; // el largo de la puerta corre con la veta = alto
      bisagras += h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2000 ? 4 : 5;
      herrajeMontaje += 1; // tirador / manija
    } else if (/^Frente cajón/.test(pz.nombre)) {
      correderas += 1;
      herrajeMontaje += 1;
    } else if (/^(Lateral|Base|Tapa|Entrepaño|División|Separador|Zócalo|Faldón)/.test(pz.nombre)) {
      estructura += 1;
    }
  }
  // ~4 uniones por pieza estructural (tornillo + tarugo en cada esquina/punto)
  const tornillos = estructura * 4 + bisagras * 2 + correderas * 6 + herrajeMontaje * 2;
  const tarugos = estructura * 4;
  return { bisagras, correderas, tornillos, tarugos };
}

// Moneda colombiana
const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CO');

// Guarda el último despiece calculado para mostrarlo también dentro de AR
let datosDespiece = null;

// Calcula TODO el proyecto: piezas, áreas, herrajes, corte y cotización.
function calcularProyecto(piezas) {
  const filas = agruparDespiece(piezas);
  const laminaL = +$('laminaL').value, laminaA = +$('laminaA').value, kerf = +$('kerf').value;
  const corte = optimizarCorte(piezas, laminaL, laminaA, kerf);
  const herr = calcularHerrajes(piezas);

  const totalPiezas = filas.reduce((s, f) => s + f.cant, 0);
  const areaPiezas = filas.reduce((s, f) => s + f.areaTotal, 0);   // m²
  const cantoTotal = filas.reduce((s, f) => s + f.cantoTotal, 0);  // m

  // ----- Costos -----
  const pLamina = +$('precioLamina').value;
  const pCanto = +$('precioCanto').value;
  const pBisagra = +$('precioBisagra').value;
  const pCorredera = +$('precioCorredera').value;
  const pMO = +$('precioMO').value;

  const costoTableros = corte.nLaminas * pLamina;
  const costoCanto = cantoTotal * pCanto;
  const costoHerrajes = herr.bisagras * pBisagra + herr.correderas * pCorredera;
  const costoMO = pMO;
  const costoTotal = costoTableros + costoCanto + costoHerrajes + costoMO;

  const margen = (+$('margen').value) / 100;
  const precioVenta = costoTotal * (1 + margen);
  const ganancia = precioVenta - costoTotal;
  // Sugerencias rápidas a varios márgenes
  const sugerencias = [0.3, 0.4, 0.5].map(m => ({ m, venta: costoTotal * (1 + m) }));

  return {
    filas, corte, herr, totalPiezas, areaPiezas, cantoTotal, kerf,
    laminaL, laminaA,
    costoTableros, costoCanto, costoHerrajes, costoMO, costoTotal,
    margen, precioVenta, ganancia, sugerencias,
    hayPrecios: costoTotal > 0,
  };
}

// ============================== Despiece y plano de corte ==============================
function actualizarDespiece(piezas, p) {
  const d = calcularProyecto(piezas);
  datosDespiece = d;

  // Estructura = carcasa (tapa, piso, costados, divisiones, fondo, zócalo).
  // Accesorios = puertas, cajones, entrepaños, tubo colgador.
  const esEstructura = (nom) =>
    /^(Lateral int\.|Lateral|Base|Tapa|Trasera|Zócalo|División|Separador|Faldón|Pata)/.test(nom)
    && !/cajón/.test(nom);
  const fila = (f) =>
    `<tr><td>${f.nombre}${f.esLamina ? '' : ' *'}</td><td>${f.cant}</td><td>${f.largo}</td><td>${f.ancho}</td><td>${f.esp}</td><td>${f.veta === 'v' ? 'V' : 'H'}</td><td>${f.areaTotal.toFixed(3)}</td></tr>`;
  const estructura = d.filas.filter(f => esEstructura(f.nombre));
  const accesorios = d.filas.filter(f => !esEstructura(f.nombre));
  const seccion = (titulo) => `<tr class="sec"><td colspan="7">${titulo}</td></tr>`;
  const tbody = $('tablaDespiece').querySelector('tbody');
  tbody.innerHTML =
    seccion('ESTRUCTURA') + estructura.map(fila).join('') +
    (accesorios.length ? seccion('ACCESORIOS') + accesorios.map(fila).join('') : '');

  dibujarPlanos(d.corte, d.laminaL, d.laminaA, $('planoSheets'));

  const lineasHerr = [];
  if (d.herr.bisagras) lineasHerr.push(`Bisagras cazoleta: <b>${d.herr.bisagras}</b>`);
  if (d.herr.correderas) lineasHerr.push(`Correderas (pares): <b>${d.herr.correderas}</b>`);
  if (d.herr.tornillos) lineasHerr.push(`Tornillos aprox.: <b>${d.herr.tornillos}</b>`);
  if (d.herr.tarugos) lineasHerr.push(`Tarugos/espigas: <b>${d.herr.tarugos}</b>`);

  $('resumenDespiece').innerHTML =
    `<b>${d.totalPiezas}</b> piezas · <b>${d.areaPiezas.toFixed(2)} m²</b> de tablero neto<br>` +
    `Canto perimetral: <b>${d.cantoTotal.toFixed(1)} m</b> · Espesor cuchilla: <b>${d.kerf} mm</b>` +
    (lineasHerr.length ? `<br><b style="color:var(--accent)">Herrajes:</b> ${lineasHerr.join(' · ')}` : '') +
    `<br><small>Medidas en mm (largo va con la veta). * Trasera/fondos 3 mm y patas macizas: no salen de la lámina principal.</small>`;

  const avisos = d.corte.sinCaber.length
    ? `<br><span style="color:#e07050">No caben enteras: ${d.corte.sinCaber.join(', ')}</span>` : '';
  $('planoInfo').innerHTML =
    `Tableros: <b>${d.corte.nLaminas}</b> de ${d.laminaL}×${d.laminaA} mm (${d.corte.areaLaminas.toFixed(2)} m²)<br>` +
    `Aprovechamiento: <b>${d.corte.aprovechamiento.toFixed(1)}%</b> · ` +
    `Desperdicio: <b>${d.corte.areaDesperdicio.toFixed(2)} m²</b><br>` +
    `Corte total de sierra: <b>${d.corte.longitudCorte.toFixed(1)} m</b> (kerf ${d.kerf} mm)${avisos}`;

  actualizarCotizacion(d);
}

function actualizarCotizacion(d) {
  $('margenVal').textContent = `${Math.round(d.margen * 100)}%`;
  if (!d.hayPrecios) {
    $('cotizacion').innerHTML =
      `<small>Ingresa los precios (lámina, canto, herrajes, mano de obra) para ver el costo y el precio de venta sugerido.</small>`;
    return;
  }
  const filaCosto = [
    ['Tableros', d.costoTableros],
    ['Canto', d.costoCanto],
    ['Herrajes', d.costoHerrajes],
    ['Mano de obra', d.costoMO],
  ].filter(([, v]) => v > 0)
   .map(([k, v]) => `${k}: <b>${fmt(v)}</b>`).join(' · ');

  const sug = d.sugerencias.map(s =>
    `${Math.round(s.m * 100)}%: <b>${fmt(s.venta)}</b>`).join(' · ');

  $('cotizacion').innerHTML =
    `${filaCosto}<br>` +
    `<b>Costo total: ${fmt(d.costoTotal)}</b><br>` +
    `<span style="color:var(--accent)">Precio de venta (${Math.round(d.margen * 100)}%): <b>${fmt(d.precioVenta)}</b></span><br>` +
    `Ganancia: <b>${fmt(d.ganancia)}</b><br>` +
    `<small>Sugerencias — ${sug}</small>`;
}

// ============================== Materiales (swatches) ==============================
const cont = $('swatches');
for (const preset of PRESETS) {
  const div = document.createElement('div');
  div.className = 'swatch' + (preset.id === materialActual ? ' active' : '');
  div.dataset.id = preset.id;
  div.appendChild(crearSwatchCanvas(preset));
  const lbl = document.createElement('div');
  lbl.textContent = preset.nombre;
  div.appendChild(lbl);
  div.onclick = () => seleccionarMaterial(preset.id);
  cont.appendChild(div);
}

function seleccionarMaterial(id) {
  materialActual = id;
  cont.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.id === id));
  reconstruir();
}

// ============================== Controles UI ==============================
// Cambios que modifican la geometría → reconstruyen el mueble
['alto', 'prof', 'zocalo', 'apertura', 'laminaL', 'laminaA', 'kerf']
  .forEach(id => $(id).addEventListener('input', reconstruir));
// Ancho y espesor además recalculan el ancho mostrado de cada módulo
['ancho', 'espesor'].forEach(id =>
  $(id).addEventListener('input', () => { sincronizarModulos(); reconstruir(); }));

// Íconos visuales junto a cada campo: de un vistazo se entiende qué es cada
// cosa (entrepaño = repisas, divisiones = columnas, subdiv = celdas/cava…).
const ICONO_CAMPO = {
  ancho: 'ancho', alto: 'alto', prof: 'prof', espesor: 'espesor',
  divisiones: 'division', modulo: 'modulo', entrepanos: 'entrepano',
  subdiv: 'subdivision', puertas: 'puerta', cajones: 'cajon',
  zocalo: 'zocalo', apertura: 'puerta',
};
for (const [id, ico] of Object.entries(ICONO_CAMPO)) {
  const el = $(id);
  const label = el?.closest('label');
  if (!label) continue;
  // Envuelve el texto del label en una fila con el ícono
  const fila = document.createElement('span');
  fila.className = 'lbl-ico';
  fila.appendChild(iconoCanvas(ico, 18));
  const texto = document.createElement('span');
  texto.textContent = label.childNodes[0]?.textContent?.trim() || '';
  fila.appendChild(texto);
  if (label.childNodes[0]?.nodeType === Node.TEXT_NODE) label.childNodes[0].remove();
  label.insertBefore(fila, label.firstChild);
}

// Leyenda visual de símbolos de carpintería
const LEYENDA = [
  ['entrepano', 'Entrepaño (repisa horizontal)'],
  ['division', 'División vertical / módulo'],
  ['subdivision', 'Subdivisión (celdas, cava)'],
  ['puerta', 'Puerta'],
  ['cajon', 'Cajón'],
  ['ancho', 'Ancho'],
  ['alto', 'Alto'],
  ['prof', 'Profundidad'],
  ['espesor', 'Espesor de lámina'],
  ['zocalo', 'Zócalo'],
  ['material', 'Material / acabado'],
  ['modulo', 'Módulo (sección)'],
];
{
  const grid = $('leyendaGrid');
  if (grid) {
    for (const [ico, txt] of LEYENDA) {
      const item = document.createElement('div');
      item.className = 'leyenda-item';
      item.appendChild(iconoCanvas(ico, 20));
      const t = document.createElement('span');
      t.textContent = txt;
      item.appendChild(t);
      grid.appendChild(item);
    }
  }
}

// Módulos independientes: divisiones cambia el número de módulos;
// el selector elige cuál editar; entrepaños/subdiv aplican a ese módulo.
// Al elegir "Cómoda" se siembran cajones en todos los módulos (y sin puertas);
// otros tipos vuelven a puertas. Así el frente correcto aparece de una.
$('tipo').addEventListener('change', () => {
  const esComoda = $('tipo').value === 'comoda';
  for (const m of modulosConfig) {
    if (esComoda) { m.cajones = m.cajones || 4; m.puertas = 0; m.entrepanos = 0; }
    else if (m.cajones > 0 && m.puertas === 0) { m.cajones = 0; m.puertas = 2; m.entrepanos = 1; }
  }
  reflejarModuloEnInputs();
  reconstruir();
});

$('divisiones').addEventListener('input', () => { sincronizarModulos(); reconstruir(); });
$('modulo').addEventListener('change', () => { moduloSel = +$('modulo').value; reflejarModuloEnInputs(); });
// Entrepaños, subdiv, PUERTAS, CAJONES y TUBO aplican al módulo seleccionado
['anchoMod', 'altoMod', 'entrepanos', 'subdiv', 'puertas', 'cajones', 'tubo'].forEach(id =>
  $(id).addEventListener('input', () => { aplicarAModulo(); sincronizarModulos(); reconstruir(); }));
sincronizarModulos();

// Cambios solo de precios/margen → recalculan costos SIN rebuilds 3D
['precioLamina', 'precioCanto', 'precioBisagra', 'precioCorredera', 'precioMO', 'margen']
  .forEach(id => $(id).addEventListener('input', () => {
    const p = leerParametros();
    actualizarDespiece(generarPiezas(p), p);
  }));

$('ensamblaje').addEventListener('input', e => {
  factorEnsamblaje = e.target.value / 100;
  aplicarEnsamblaje();
});

$('btnPuertas').onclick = alternarPuertas;

let animando = false;
$('btnAnimar').onclick = () => {
  if (animando) return;
  animando = true;
  factorEnsamblaje = 0;
  const inicio = performance.now(), dur = 2200;
  const paso = (now) => {
    const t = Math.min(1, (now - inicio) / dur);
    factorEnsamblaje = suaviza(t);
    $('ensamblaje').value = factorEnsamblaje * 100;
    aplicarEnsamblaje();
    if (t < 1) requestAnimationFrame(paso); else animando = false;
  };
  requestAnimationFrame(paso);
};

// Pestañas del panel derecho
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-content').forEach(c =>
      c.classList.toggle('active', c.id === 'tab-' + btn.dataset.tab));
  };
});

// ============================== Guardar / abrir / exportar ==============================
const CLAVE = 'muebleXR.proyectos';
const leerProyectos = () => JSON.parse(localStorage.getItem(CLAVE) || '{}');

function refrescarListaProyectos() {
  const proyectos = leerProyectos();
  const sel = $('selProyectos');
  // Mis muebles guardados + 50 plantillas profesionales por categoría
  const mios = Object.entries(proyectos).map(([n, d]) => {
    const p = d.params || {};
    const dim = p.ancho ? ` (${p.ancho}×${p.alto}×${p.prof})` : '';
    return `<option value="${n}">${n}${dim}</option>`;
  }).join('');
  const cats = [...new Set(PLANTILLAS.map(t => t.cat))];
  const grupos = cats.map(cat =>
    `<optgroup label="📐 ${cat}">` +
    PLANTILLAS.map((t, i) => t.cat === cat
      ? `<option value="tpl:${i}">${t.nombre} (${t.params.ancho}×${t.params.alto}×${t.params.prof})</option>` : '')
      .join('') +
    `</optgroup>`
  ).join('');
  sel.innerHTML = '<option value="">📚 Biblioteca de muebles…</option>' +
    (mios ? `<optgroup label="💾 Mis muebles">${mios}</optgroup>` : '') +
    grupos;
}
refrescarListaProyectos();

$('btnGuardar').onclick = () => {
  const proyectos = leerProyectos();
  const nombre = $('nombreProyecto').value.trim() || 'Proyecto sin nombre';
  proyectos[nombre] = { params: leerParametros(), material: materialActual, fecha: new Date().toISOString() };
  localStorage.setItem(CLAVE, JSON.stringify(proyectos));
  refrescarListaProyectos();
  $('btnGuardar').textContent = '✔ Guardado en biblioteca';
  setTimeout(() => $('btnGuardar').textContent = '💾 Guardar', 1800);
};

function cargarProyecto(datos, nombre) {
  $('nombreProyecto').value = nombre;
  restaurarParams(datos.params); // inputs + configuración completa de módulos
  materialActual = datos.material || 'roble';
  cont.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.id === materialActual));
  reconstruir();
}

$('selProyectos').onchange = (e) => {
  const valor = e.target.value;
  if (!valor) return;
  if (valor.startsWith('tpl:')) {
    // Plantilla profesional: se carga y queda 100 % editable
    const t = PLANTILLAS[+valor.slice(4)];
    if (t) cargarProyecto({ params: t.params, material: t.material }, t.nombre);
  } else {
    const datos = leerProyectos()[valor];
    if (datos) cargarProyecto(datos, valor);
  }
  e.target.value = '';
};

$('btnExportar').onclick = () => {
  const datos = { nombre: $('nombreProyecto').value, params: leerParametros(), material: materialActual };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${datos.nombre.replace(/\s+/g, '_')}.florenza.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ============================== Ficha PDF del mueble ==============================
// Abre una ventana imprimible con toda la info; el usuario elige "Guardar como PDF".
$('btnPDF').onclick = () => {
  const p = leerParametros();
  const d = datosDespiece;
  if (!d) return;
  const nombre = $('nombreProyecto').value || 'Mueble';
  const mat = PRESETS.find(m => m.id === materialActual)?.nombre ?? '';
  const fila = (f) => `<tr><td>${f.nombre}</td><td>${f.cant}</td><td>${f.largo}</td><td>${f.ancho}</td><td>${f.esp}</td><td>${f.areaTotal.toFixed(3)}</td></tr>`;
  const esEst = (n) => /^(Lateral|Base|Tapa|Trasera|Zócalo|División|Faldón|Pata)/.test(n) && !/cajón/.test(n);
  const estr = d.filas.filter(f => esEst(f.nombre)).map(fila).join('');
  const acc = d.filas.filter(f => !esEst(f.nombre)).map(fila).join('');
  const modulosTxt = modulosConfig.map((m, i) => {
    const cosas = [];
    if (m.puertas) cosas.push(`${m.puertas} puerta(s)`);
    if (m.cajones) cosas.push(`${m.cajones} cajón(es)`);
    if (m.entrepanos) cosas.push(`${m.entrepanos} entrepaño(s)`);
    if (m.subdiv) cosas.push(`${m.subdiv} subdivisión(es)`);
    if (m.tubo) cosas.push('tubo colgador');
    return `<li><b>Módulo ${String.fromCharCode(65 + i)}</b>: ${cosas.length ? cosas.join(', ') : 'vacío'}</li>`;
  }).join('');
  const herr = [];
  if (d.herr.bisagras) herr.push(`Bisagras: ${d.herr.bisagras}`);
  if (d.herr.correderas) herr.push(`Correderas: ${d.herr.correderas}`);
  if (d.herr.tornillos) herr.push(`Tornillos: ${d.herr.tornillos}`);
  if (d.herr.tarugos) herr.push(`Tarugos: ${d.herr.tarugos}`);
  const costo = d.hayPrecios
    ? `<p><b>Costo:</b> ${fmt(d.costoTotal)} · <b>Venta (${Math.round(d.margen*100)}%):</b> ${fmt(d.precioVenta)}</p>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${nombre}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#222;margin:30px;font-size:13px}
    h1{color:#c97f1f;margin:0 0 4px} h2{color:#c97f1f;border-bottom:2px solid #e8a33d;padding-bottom:3px;margin-top:22px;font-size:15px}
    table{width:100%;border-collapse:collapse;margin-top:6px} th,td{border:1px solid #ccc;padding:4px 7px;text-align:right}
    th:first-child,td:first-child{text-align:left} th{background:#f3e7d3}
    .meta{color:#666} ul{margin:6px 0}
    @media print{button{display:none}}
  </style></head><body>
  <h1>🪚 Florenza V — ${nombre}</h1>
  <p class="meta">${$('tipo').selectedOptions[0].text} · ${p.ancho} × ${p.alto} × ${p.prof} mm · Lámina ${p.espesor} mm · ${mat} · ${new Date().toLocaleDateString('es-CO')}</p>
  <h2>Módulos</h2><ul>${modulosTxt}</ul>
  <h2>Estructura</h2>
  <table><tr><th>Pieza</th><th>Cant.</th><th>Largo</th><th>Ancho</th><th>Esp.</th><th>Área m²</th></tr>${estr}</table>
  ${acc ? `<h2>Accesorios</h2><table><tr><th>Pieza</th><th>Cant.</th><th>Largo</th><th>Ancho</th><th>Esp.</th><th>Área m²</th></tr>${acc}</table>` : ''}
  <h2>Resumen</h2>
  <p><b>${d.totalPiezas}</b> piezas · <b>${d.areaPiezas.toFixed(2)} m²</b> de tablero · Canto: <b>${d.cantoTotal.toFixed(1)} m</b></p>
  <p>Tableros ${p.laminaL || ''}: <b>${d.corte.nLaminas}</b> · Aprovechamiento <b>${d.corte.aprovechamiento.toFixed(1)}%</b> · Corte sierra <b>${d.corte.longitudCorte.toFixed(1)} m</b> (kerf ${d.kerf} mm)</p>
  ${herr.length ? `<p><b>Herrajes:</b> ${herr.join(' · ')}</p>` : ''}
  ${costo}
  <button onclick="print()" style="margin-top:20px;padding:10px 20px;font-size:14px;background:#e8a33d;border:0;border-radius:8px;cursor:pointer">Imprimir / Guardar PDF</button>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
};

// ============================== Código del mueble (compartir) ==============================
// El "código" es el diseño completo comprimido en texto (base64). Sirve para
// pasar un mueble entre el PC y el Quest, o entre clientes, sin archivos.
function msgCodigo(texto, error = false) {
  const m = $('codigoMsg');
  m.style.display = 'block';
  m.style.color = error ? '#e07050' : 'var(--muted)';
  m.textContent = texto;
}

function generarCodigo() {
  const datos = { v: 1, nombre: $('nombreProyecto').value, params: leerParametros(), material: materialActual };
  // FV- + base64 del JSON (unescape/encodeURIComponent para acentos)
  return 'FV-' + btoa(unescape(encodeURIComponent(JSON.stringify(datos))));
}

$('btnCopiarCodigo').onclick = async () => {
  const codigo = generarCodigo();
  $('codigoMueble').value = codigo;
  try {
    await navigator.clipboard.writeText(codigo);
    msgCodigo('✔ Código copiado al portapapeles. Pégalo donde quieras.');
  } catch {
    $('codigoMueble').select();
    msgCodigo('Selecciona el texto de arriba y cópialo (Ctrl+C).');
  }
};

$('btnCargarCodigo').onclick = () => {
  const txt = $('codigoMueble').value.trim();
  if (!txt) { msgCodigo('Pega primero un código en el recuadro.', true); return; }
  try {
    const json = txt.startsWith('FV-')
      ? decodeURIComponent(escape(atob(txt.slice(3))))
      : txt; // admite también pegar el JSON crudo
    const datos = JSON.parse(json);
    if (!datos.params) throw new Error('sin datos');
    cargarProyecto(datos, datos.nombre || 'Mueble importado');
    msgCodigo('✔ Mueble cargado desde el código.');
  } catch {
    msgCodigo('Código no válido. Revisa que esté completo.', true);
  }
};

// ============================== Importar GLB ==============================
const loaderGLB = new GLTFLoader();
$('inpGLB').addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const url = URL.createObjectURL(archivo);
  loaderGLB.load(url, (gltf) => {
    const modelo = gltf.scene;
    // Apoyarlo en el piso, al lado del mueble
    const caja = new THREE.Box3().setFromObject(modelo);
    const tam = caja.getSize(new THREE.Vector3());
    const centro = caja.getCenter(new THREE.Vector3());
    modelo.position.sub(centro);
    modelo.position.y += tam.y / 2;
    modelo.position.x += (leerParametros().ancho / 1000) / 2 + tam.x / 2 + 0.3;
    modelo.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    scene.add(modelo);
    URL.revokeObjectURL(url);
  }, undefined, (err) => alert('No se pudo cargar el modelo: ' + err.message));
  e.target.value = '';
});

// ============================== Realidad Mixta (Quest 3 / 3S) ==============================
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-ar').then((soportado) => {
    if (!soportado) return;
    const btnAR = ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['local-floor', 'plane-detection', 'mesh-detection', 'anchors'],
    });
    btnAR.style.bottom = '20px';
    document.body.appendChild(btnAR);
  }).catch(() => {});
}

const reticula = new THREE.Mesh(
  new THREE.RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xe8a33d })
);
reticula.matrixAutoUpdate = false;
reticula.visible = false;
scene.add(reticula);

let hitTestSource = null;
let paredes = [];         // [{normal, punto, yaw}] paredes detectadas
let pisoPlanos = null;    // y del piso según los planos del escaneo
let techoPlanos = null;   // y del techo según los planos
let reticleMinY = null;   // y más bajo visto por la retícula (respaldo del piso)
let techoParedes = null;  // borde superior de las paredes (respaldo del techo)
let historial = [];       // pila de estados para Deshacer
let mallaVisible = false; // malla del escaneo OCULTA por defecto (botón "Malla")
let modoRotar = false;    // palanca derecha: false = subir/bajar, true = rotar
let moverActivo = false;  // palanca izquierda apagada por defecto (botón "Mover")
let topesActivos = false; // topes de pared/techo APAGADOS por defecto (botón "Topes")
let paredMarcada = null;     // XRPlane elegido como pared de trabajo (🎯)
let modoMarcarPared = false; // esperando que el usuario apunte la pared
let llevando = null;      // modo "llevar": {ctrl, mano, dist, inicio, persistente, soltar}
let muebles = [];         // muebles ya colocados (además del activo)
let alturaLibre = false;  // false = el mueble vive pegado al piso (predeterminado)
let ancla = null;         // XRAnchor: clava el mueble al mundo real (sin deriva)
let anclaGen = 0;         // invalida anclas pendientes cuando el mueble se mueve
let framesQuietos = 0;

function liberarAncla() {
  anclaGen++;
  try { ancla?.delete?.(); } catch { /* ya borrada */ }
  ancla = null;
  anclaPlano = null;
}

// Llamar SIEMPRE que el usuario mueva el mueble: suelta el ancla vieja
function marcarMovimiento() {
  liberarAncla();
  framesQuietos = 0;
}

const _qAncla = new THREE.Quaternion();
const _eAncla = new THREE.Euler();
const _mAncla = new THREE.Matrix4();
let anclaPlano = null; // respaldo: posición relativa a una pared del escaneo

// Orientación (yaw) cruda de un plano a partir de su pose, sin voltear
function yawDePlano(pose) {
  const o = pose.transform.orientation;
  _qAncla.set(o.x, o.y, o.z, o.w);
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(_qAncla);
  return Math.atan2(n.x, n.z);
}

// Cuando el mueble lleva un momento quieto se clava al mundo real: con un
// XRAnchor si el navegador lo soporta, o relativo a una pared del escaneo
// (las paredes las ancla el propio Quest). Así NO deriva al moverte.
function procesarAncla(frame) {
  if (!muebleGroup || llevando || gizmoDrag || !renderer.xr.isPresenting) return;
  const ref = renderer.xr.getReferenceSpace();

  if (ancla) {
    const pose = frame.getPose(ancla.anchorSpace, ref);
    if (pose) {
      const p = pose.transform.position, o = pose.transform.orientation;
      muebleGroup.position.set(p.x, p.y, p.z);
      _qAncla.set(o.x, o.y, o.z, o.w);
      _eAncla.setFromQuaternion(_qAncla, 'YXZ');
      muebleGroup.rotation.set(0, _eAncla.y, 0);
    }
    return;
  }

  if (anclaPlano) {
    const pose = frame.getPose(anclaPlano.plano.planeSpace, ref);
    if (!pose) { anclaPlano = null; framesQuietos = 0; return; }
    _mAncla.fromArray(pose.transform.matrix);
    muebleGroup.position.copy(anclaPlano.off).applyMatrix4(_mAncla);
    muebleGroup.rotation.set(0, yawDePlano(pose) + anclaPlano.offYaw, 0);
    return;
  }

  if (++framesQuietos !== 20) return;

  if (frame.createAnchor) {
    const gen = anclaGen;
    _qAncla.setFromEuler(_eAncla.set(0, muebleGroup.rotation.y, 0, 'YXZ'));
    frame.createAnchor(new XRRigidTransform(
      { x: muebleGroup.position.x, y: muebleGroup.position.y, z: muebleGroup.position.z, w: 1 },
      { x: _qAncla.x, y: _qAncla.y, z: _qAncla.z, w: _qAncla.w }
    ), ref).then((a) => {
      if (gen === anclaGen && !ancla) ancla = a;
      else { try { a.delete(); } catch { /* nada */ } }
    }).catch(() => { framesQuietos = 0; anclarAPlano(frame, ref); });
  } else {
    anclarAPlano(frame, ref);
  }
}

function anclarAPlano(frame, ref) {
  // Pared más cercana al mueble como marco de referencia fijo
  let mejor = null, mejorDist = Infinity;
  for (const w of paredes) {
    if (!w.plano) continue;
    const d = Math.abs(_vTmp.subVectors(muebleGroup.position, w.punto).dot(w.normal));
    if (d < mejorDist) { mejorDist = d; mejor = w; }
  }
  if (!mejor) return;
  const pose = frame.getPose(mejor.plano.planeSpace, ref);
  if (!pose) return;
  _mAncla.fromArray(pose.transform.matrix).invert();
  anclaPlano = {
    plano: mejor.plano,
    off: muebleGroup.position.clone().applyMatrix4(_mAncla),
    offYaw: muebleGroup.rotation.y - yawDePlano(pose),
  };
}

// Piso y techo efectivos: malla escaneada > planos > retícula > origen
// El piso es SIEMPRE el piso real de la habitación (plano del escaneo).
// No se usa la malla fina: hacía que el mueble "se subiera" a mesas y sofás
// escaneados y quedara flotando con saltos.
function nivelPiso() {
  if (pisoPlanos !== null) return pisoPlanos;
  if (reticleMinY !== null) return reticleMinY;
  return 0;
}
function nivelTecho() {
  if (techoPlanos !== null) return techoPlanos;
  return techoParedes; // puede ser null si aún no hay datos
}

// ---------- Fábrica de botones 3D con etiqueta redibujable ----------
// El canvas se dibuja al DOBLE de resolución + anisotropía: texto NÍTIDO
// en el visor (antes se veía borroso por textura de baja resolución).
const NITIDEZ = 2;
function texturaTexto(texto, w, h, fuente, bg, fg, icono = null) {
  const cv = document.createElement('canvas');
  cv.width = w * NITIDEZ; cv.height = h * NITIDEZ;
  const ctx = cv.getContext('2d');
  ctx.scale(NITIDEZ, NITIDEZ);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const dibujar = (txt) => {
    ctx.clearRect(0, 0, w, h);
    const r = Math.min(18, h * 0.28);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#332b23');
    grad.addColorStop(1, bg);
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, r);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#6a5638';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = fuente;
    ctx.textAlign = icono ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    if (icono && txt) {
      const isz = h * 0.72;
      dibujarIcono(ctx, icono, h * 0.12, (h - isz) / 2, isz, fg);
      ctx.fillText(txt, h * 0.95, h / 2 + 1);
    } else if (icono) {
      // Solo ícono: centrado (chips del panel)
      const isz = h * 0.82;
      dibujarIcono(ctx, icono, (w - isz) / 2, (h - isz) / 2, isz, fg);
    } else {
      ctx.fillText(txt, w / 2, h / 2 + 1, w - 14); // se comprime si es largo
    }
    tx.needsUpdate = true;
  };
  dibujar(texto);
  return { tx, dibujar };
}

// Coloca un panel flotante frente al usuario, VERTICAL (solo giro yaw).
// El lookAt de antes lo inclinaba de forma incómoda cuando el panel era alto
// o el usuario miraba hacia abajo — quedaba "acostado" o mal ubicado.
function colocarPanelFrente(grupo, dist, dy = -0.03) {
  const cam = renderer.xr.getCamera();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); else dir.normalize();
  grupo.position.copy(cam.position).addScaledVector(dir, dist);
  grupo.position.y = cam.position.y + dy;
  grupo.rotation.set(0, Math.atan2(dir.x, dir.z) + Math.PI, 0);
  grupo.visible = true;
}

function crearBotonXR(etiqueta, accion, w, h, fuente = 'bold 30px sans-serif', icono = null) {
  const t = texturaTexto(etiqueta, 256, 96, fuente, '#26211c', '#ece5dc', icono);
  const btn = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: t.tx, transparent: true })
  );
  btn.userData.accion = accion;
  btn.userData.setLabel = t.dibujar;
  return btn;
}

// ---------- Historial (Deshacer) ----------
function guardarHistorial() {
  if (!muebleGroup) return;
  historial.push({
    params: leerParametros(),
    material: materialActual,
    escala: escalaMueble,
    pos: muebleGroup.position.clone(),
    rotY: muebleGroup.rotation.y,
  });
  if (historial.length > 25) historial.shift();
}

function deshacer() {
  const s = historial.pop();
  if (!s) return;
  marcarMovimiento();
  for (const [k, v] of Object.entries(s.params)) if ($(k)) $(k).value = v;
  escalaMueble = s.escala;
  seleccionarMaterial(s.material); // reconstruye con todo
  muebleGroup.position.copy(s.pos);
  muebleGroup.rotation.set(0, s.rotY, 0);
  muebleGroup.scale.setScalar(0.001 * escalaMueble);
}

// Giro en pasos exactos (grips y botones ⟲/⟳ del panel)
function girarMueble(grados) {
  if (!muebleGroup) return;
  guardarHistorial();
  marcarMovimiento();
  muebleGroup.rotation.y += THREE.MathUtils.degToRad(grados);
  restringirPosicion();
}

// Asentar el mueble en el piso y dejarlo en modo "pegado al piso"
function alPiso() {
  if (!muebleGroup) return;
  guardarHistorial();
  marcarMovimiento();
  alturaLibre = false;
  muebleGroup.position.y = nivelPiso();
  restringirPosicion();
}

// "Grado cero": el frente del mueble queda RECTO hacia donde estás mirando
// (perpendicular a tu vista), no inclinado hacia tu posición.
function frenteAMi() {
  if (!muebleGroup) return;
  guardarHistorial();
  marcarMovimiento();
  const cam = renderer.xr.getCamera();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); else dir.normalize();
  // El frente (+Z del mueble) apunta en contra de tu dirección de vista
  muebleGroup.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
  restringirPosicion();
}

function fijarEscala(v) {
  escalaMueble = Math.min(3, Math.max(0.2, Math.round(v * 10) / 10));
  if (muebleGroup) muebleGroup.scale.setScalar(0.001 * escalaMueble);
  actualizarPanelInfo();
}

// ---------- Panel de la mano izquierda (rediseñado: simple y claro) ----------
// Eliges QUÉ ajustar (Ancho/Alto/Prof./Entrepaños) y usas − / + grandes.
const panelXR = new THREE.Group();
panelXR.visible = false;
const botonesXR = [];

const CAMPOS_PANEL = {
  ancho: { etiqueta: 'Ancho', paso: 50, unidad: ' mm', icono: 'ancho' },
  alto: { etiqueta: 'Alto', paso: 50, unidad: ' mm', icono: 'alto' },
  prof: { etiqueta: 'Prof.', paso: 50, unidad: ' mm', icono: 'prof' },
  entrepanos: { etiqueta: 'Entrep.', paso: 1, unidad: '', icono: 'entrepano' },
  divisiones: { etiqueta: 'Divis.', paso: 1, unidad: '', icono: 'division' },
};
let campoSel = 'ancho';
const chipsXR = [];

function ajustarCampo(id, delta) {
  guardarHistorial();
  const el = $(id);
  el.value = Math.max(+el.min || 0, Math.min(+el.max || 99999, +el.value + delta));
  reconstruir();
}

const fondoPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(0.29, 0.235),
  new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.85 })
);
panelXR.add(fondoPanel);

// Barra superior: medidas + material + escala
const infoTex = texturaTexto('', 512, 56, 'bold 26px sans-serif', '#26211c', '#e8a33d');
const infoMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.27, 0.027),
  new THREE.MeshBasicMaterial({ map: infoTex.tx, transparent: true })
);
infoMesh.position.set(0, 0.1, 0.002);
panelXR.add(infoMesh);

// Valor grande del campo seleccionado
const valorTex = texturaTexto('', 256, 96, 'bold 44px sans-serif', '#14110e', '#ece5dc');
const valorMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.09, 0.045),
  new THREE.MeshBasicMaterial({ map: valorTex.tx, transparent: true })
);
valorMesh.position.set(0, 0.018, 0.002);
panelXR.add(valorMesh);

const NOMBRES_TIPO = { bajo: 'Bajo', alacena: 'Alacena', closet: 'Clóset', comoda: 'Cómoda', mesa: 'Mesa' };

function actualizarPanelInfo() {
  const p = leerParametros();
  const nombre = PRESETS.find(m => m.id === materialActual)?.nombre ?? '';
  const esc = escalaMueble !== 1 ? ` · ${Math.round(escalaMueble * 100)}%` : '';
  infoTex.dibujar(`${NOMBRES_TIPO[p.tipo] ?? ''} ${p.ancho}×${p.alto}×${p.prof} — ${nombre}${esc}`);
  valorTex.dibujar(`${$(campoSel).value}${CAMPOS_PANEL[campoSel].unidad}`);
  for (const c of chipsXR) c.userData.activo = (c.userData.campo === campoSel);
}

{
  // Fila 1: selector de campo (chips con ÍCONO, sin texto: más claros y grandes)
  const cw = 0.052, ch = 0.038, cg = 0.004;
  Object.entries(CAMPOS_PANEL).forEach(([campo, def], i) => {
    const chip = crearBotonXR('', () => { campoSel = campo; actualizarPanelInfo(); }, cw, ch, 'bold 26px sans-serif', def.icono);
    chip.userData.campo = campo;
    chip.position.set((i - 2) * (cw + cg), 0.07, 0.003);
    panelXR.add(chip);
    botonesXR.push(chip);
    chipsXR.push(chip);
  });

  // Fila 2: − [valor] + (botones grandes)
  const menos = crearBotonXR('−', () => ajustarCampo(campoSel, -CAMPOS_PANEL[campoSel].paso), 0.06, 0.05, 'bold 60px sans-serif');
  menos.position.set(-0.09, 0.018, 0.003);
  panelXR.add(menos);
  botonesXR.push(menos);

  const mas = crearBotonXR('+', () => ajustarCampo(campoSel, CAMPOS_PANEL[campoSel].paso), 0.06, 0.05, 'bold 60px sans-serif');
  mas.position.set(0.09, 0.018, 0.003);
  panelXR.add(mas);
  botonesXR.push(mas);

  // Filas 3 y 4: acciones frecuentes. Los botones de modo (Rotar, Mover)
  // se pintan naranja cuando están activos.
  let btnRotar = null, btnMover = null;
  const filaBtns = (lista, yFila) => {
    const bw = 0.064, bh = 0.03, bg = 0.005;
    lista.forEach(([etiqueta, accion], i) => {
      const btn = crearBotonXR(etiqueta, accion, bw, bh);
      btn.position.set((i - 1.5) * (bw + bg), yFila, 0.003);
      panelXR.add(btn);
      botonesXR.push(btn);
      if (etiqueta === 'Rotar: No') btnRotar = btn;
      if (etiqueta === 'Mover: Sí') btnMover = btn;
    });
  };
  filaBtns([
    ['Material', () => {
      guardarHistorial();
      const i = PRESETS.findIndex(p => p.id === materialActual);
      seleccionarMaterial(PRESETS[(i + 1) % PRESETS.length].id);
    }],
    ['Puertas', alternarPuertas],
    ['Rotar: No', () => {
      modoRotar = !modoRotar;
      btnRotar.userData.setLabel(modoRotar ? 'Rotar: Sí' : 'Rotar: No');
      btnRotar.userData.activo = modoRotar;
    }],
    ['Mover: Sí', () => {
      moverActivo = !moverActivo;
      btnMover.userData.setLabel(moverActivo ? 'Mover: Sí' : 'Mover: No');
      btnMover.userData.activo = moverActivo;
    }],
  ], -0.038);
  // Sin repetidos: girar 15° vive en los grips y la cruceta; Al piso en la
  // cruceta (⌂); Pegar pared en el menú A → aquí solo lo que no está en otro lado.
  filaBtns([
    ['Muebles', () => alternarSelector()],
    ['➕ Añadir', () => agregarMueble()],
    ['Frente 0°', () => frenteAMi()],
    ['Deshacer', () => deshacer()],
  ], -0.076);
  btnMover.userData.setLabel('Mover: No');
  btnMover.userData.activo = false;
}
// Posición tipo "reloj" sobre el control izquierdo, inclinado hacia el usuario
panelXR.position.set(0, 0.13, -0.06);
panelXR.rotation.x = -Math.PI / 4;

// ---------- Menú de opciones (botón A/B del mando derecho) ----------
const menuXR = new THREE.Group();
menuXR.visible = false;
scene.add(menuXR);
const botonesMenu = [];
let btnMalla = null;
let btn4Puntos = null;
let btnTopes = null;
let btnPared = null;

// Menú del botón A (mando derecho). SIN repetir lo que ya está en:
//  · mando izquierdo / cruceta (Al piso ⌂, mover, girar 15°, Eliminar, puertas)
//  · botón B "Este mueble" (abrir/cerrar puertas y cajones)
const SECCIONES_MENU = [
  ['POSICIÓN', [
    ['Pegar a pared', () => { guardarHistorial(); marcarMovimiento(); pegarAPared(Infinity); restringirPosicion(); }],
    ['Al techo', () => {
      const tec = nivelTecho();
      if (tec === null) return;
      guardarHistorial();
      marcarMovimiento();
      alturaLibre = true;
      muebleGroup.position.y = Math.max(nivelPiso(), tec - dimsAct.alto / 1000 * escalaMueble);
    }],
    ['Traer aquí', () => traerAlFrente()],
  ]],
  ['PROYECTO', [
    ['📚 Biblioteca', () => { menuXR.visible = false; alternarBiblioXR(); }],
    ['📐 4 puntos', () => alternarCuatroPuntos()],
    ['🎯 Marcar pared', () => {
      if (paredMarcada) {
        paredMarcada = null;
        modoMarcarPared = false;
      } else {
        modoMarcarPared = !modoMarcarPared;
        if (modoMarcarPared) menuXR.visible = false; // despeja para apuntar
      }
      actualizarBtnPared();
    }],
  ]],
  ['AJUSTES', [
    ['📋 Despiece', () => alternarDespieceXR()],
    ['Malla: Sí', () => {
      mallaVisible = !mallaVisible;
      mallaGroup.visible = mallaVisible && renderer.xr.isPresenting;
      btnMalla.userData.setLabel(mallaVisible ? 'Malla: Sí' : 'Malla: No');
      btnMalla.userData.activo = mallaVisible;
    }],
    ['Topes: Sí', () => {
      topesActivos = !topesActivos;
      btnTopes.userData.setLabel(topesActivos ? 'Topes: Sí' : 'Topes: No');
      btnTopes.userData.activo = topesActivos;
    }],
    ['Ayuda', () => alternarAyuda()],
    ['✕ Salir de AR', () => renderer.xr.getSession()?.end()],
  ]],
];

{
  // Fondo compacto: el alto se ajusta exactamente al contenido real
  const fondoMenu = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.42),
    new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.9 })
  );
  menuXR.add(fondoMenu);
  const tituloTex = texturaTexto('Opciones', 256, 48, 'bold 26px sans-serif', '#14110e', '#e8a33d');
  const titulo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.02),
    new THREE.MeshBasicMaterial({ map: tituloTex.tx, transparent: true })
  );
  titulo.position.set(0, 0.185, 0.002);
  menuXR.add(titulo);

  const bw = 0.104, bh = 0.032, gx = 0.007;
  let cy = 0.15;
  for (const [nombreSec, items] of SECCIONES_MENU) {
    const cab = texturaTexto(nombreSec, 360, 40, 'bold 22px sans-serif', '#1d1813', '#e8a33d');
    const cabMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.165, 0.018),
      new THREE.MeshBasicMaterial({ map: cab.tx, transparent: true })
    );
    cabMesh.position.set(0, cy, 0.002);
    menuXR.add(cabMesh);
    cy -= 0.027;
    items.forEach(([etiqueta, accion], i) => {
      const col = i % 2, fila = Math.floor(i / 2);
      const btn = crearBotonXR(etiqueta, accion, bw, bh, 'bold 26px sans-serif');
      btn.position.set((col - 0.5) * (bw + gx), cy - fila * 0.038, 0.003);
      menuXR.add(btn);
      botonesMenu.push(btn);
      if (etiqueta === 'Malla: Sí') btnMalla = btn;
      if (etiqueta === '📐 4 puntos') btn4Puntos = btn;
      if (etiqueta === 'Topes: Sí') btnTopes = btn;
      if (etiqueta === '🎯 Marcar pared') btnPared = btn;
    });
    // Avanza según las filas REALES de la sección (a prueba de crecer)
    cy -= 0.038 * Math.max(2, Math.ceil(items.length / 2)) + 0.006;
  }
  btnMalla.userData.activo = mallaVisible;
  btnTopes.userData.activo = topesActivos;
  btnMalla.userData.setLabel(mallaVisible ? 'Malla: Sí' : 'Malla: No');
  btnTopes.userData.setLabel(topesActivos ? 'Topes: Sí' : 'Topes: No');

  // ✕ flotante por encima del menú: salir de AR con un toque
  const btnX = crearBotonXR('✕', () => renderer.xr.getSession()?.end(), 0.05, 0.05, 'bold 56px sans-serif');
  btnX.position.set(0, 0.28, 0.003);
  menuXR.add(btnX);
  botonesMenu.push(btnX);
}

// ---------- Panel "Este mueble" (botón B): opciones DEL objeto activo ----------
// Se reconstruye al abrirlo según las puertas, cajones y el interior del
// mueble seleccionado: escala, abrir todo / de a uno, divisiones y subdiv.
const menuObjetoXR = new THREE.Group();
menuObjetoXR.visible = false;
scene.add(menuObjetoXR);
let botonesObjeto = [];
const fondoObjeto = new THREE.Mesh(
  new THREE.PlaneGeometry(0.26, 0.4),
  new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.9 })
);
menuObjetoXR.add(fondoObjeto);

function ajustarObjeto(id, delta) {
  guardarHistorial();
  const el = $(id);
  el.value = Math.max(+el.min || 0, Math.min(+el.max || 99, +el.value + delta));
  reconstruir();
  construirMenuObjeto(); // las puertas/cajones cambiaron: refresca el panel
}

// Cambia el número de módulos (divisiones) desde el panel del objeto
function ajustarDivisionesObjeto(delta) {
  guardarHistorial();
  const el = $('divisiones');
  el.value = Math.max(0, Math.min(6, +el.value + delta));
  sincronizarModulos();
  reconstruir();
  construirMenuObjeto();
}

// Cicla qué módulo se está editando (0 = todos)
function ciclarModulo(delta) {
  const nSec = modulosConfig.length;
  moduloSel = (moduloSel + delta + (nSec + 1)) % (nSec + 1);
  $('modulo') && ($('modulo').value = String(moduloSel));
  reflejarModuloEnInputs();
  construirMenuObjeto();
}

// Ajusta entrepaños/subdiv del módulo seleccionado y reconstruye
function ajustarCampoModulo(campo, delta) {
  guardarHistorial();
  const lim = campo === 'entrepanos' ? 12 : (campo === 'puertas' ? 2 : 8);
  const aplica = (m) => { m[campo] = Math.max(0, Math.min(lim, (m[campo] ?? 0) + delta)); };
  if (moduloSel === 0) modulosConfig.forEach(aplica);
  else if (modulosConfig[moduloSel - 1]) aplica(modulosConfig[moduloSel - 1]);
  reflejarModuloEnInputs();
  reconstruir();
  construirMenuObjeto();
}

function construirMenuObjeto() {
  // Limpia los botones previos (deja el fondo)
  for (const b of botonesObjeto) { menuObjetoXR.remove(b); b.geometry.dispose(); b.material.map?.dispose(); b.material.dispose(); }
  botonesObjeto = [];
  for (let i = menuObjetoXR.children.length - 1; i >= 0; i--) {
    const c = menuObjetoXR.children[i];
    if (c !== fondoObjeto) { menuObjetoXR.remove(c); c.geometry?.dispose?.(); }
  }

  const filas = []; // cada fila es un array de [etiqueta, accion, esTitulo?]
  filas.push([['Este mueble', null, true]]);
  filas.push([['ABRIR / CERRAR', null, true]]);
  filas.push([
    ['Abrir todo', () => abrirTodo(true)],
    ['Cerrar todo', () => abrirTodo(false)],
  ]);

  // Una pieza por cada puerta y cada cajón (abrir/cerrar individual)
  const indiv = [];
  animPuertas.forEach((p, i) => indiv.push([`Puerta ${i + 1}`, () => { p.objetivo ^= 1; }]));
  cajonesEstados.forEach((c, i) => indiv.push([`Cajón ${i + 1}`, () => { c.objetivo ^= 1; }]));
  for (let i = 0; i < indiv.length; i += 2) filas.push(indiv.slice(i, i + 2));

  filas.push([['INTERIOR (por módulo)', null, true]]);
  // Divisiones = número de módulos. Cada módulo se edita por separado.
  filas.push([
    [`Módulos: ${modulosConfig.length}`, null, false, 'lbl', 'division'],
    ['−', () => ajustarDivisionesObjeto(-1)],
    ['+', () => ajustarDivisionesObjeto(1)],
  ]);
  // Selector de cuál módulo editar
  const etqMod = moduloSel === 0 ? 'Todos' : `Mód. ${moduloSel}`;
  filas.push([
    [etqMod, null, false, 'lbl', 'modulo'],
    ['◀', () => ciclarModulo(-1)],
    ['▶', () => ciclarModulo(1)],
  ]);
  const ref = moduloSel === 0 ? modulosConfig[0] : modulosConfig[moduloSel - 1];
  filas.push([
    [`${ref?.entrepanos ?? 0}`, null, false, 'lbl', 'entrepano'],
    ['−', () => ajustarCampoModulo('entrepanos', -1)],
    ['+', () => ajustarCampoModulo('entrepanos', 1)],
  ]);
  filas.push([
    [`${ref?.subdiv ?? 0}`, null, false, 'lbl', 'subdivision'],
    ['−', () => ajustarCampoModulo('subdiv', -1)],
    ['+', () => ajustarCampoModulo('subdiv', 1)],
  ]);
  filas.push([
    [`${ref?.puertas ?? 0}`, null, false, 'lbl', 'puerta'],
    ['−', () => ajustarCampoModulo('puertas', -1)],
    ['+', () => ajustarCampoModulo('puertas', 1)],
  ]);
  filas.push([
    [`${ref?.cajones ?? 0}`, null, false, 'lbl', 'cajon'],
    ['−', () => ajustarCampoModulo('cajones', -1)],
    ['+', () => ajustarCampoModulo('cajones', 1)],
  ]);

  // Maquetación de arriba hacia abajo
  const bh = 0.03, gy = 0.006, anchoPanel = 0.24;
  const altoTotal = filas.length * (bh + gy) + 0.03;
  fondoObjeto.geometry.dispose();
  fondoObjeto.geometry = new THREE.PlaneGeometry(0.26, altoTotal);
  let cy = altoTotal / 2 - 0.03;
  for (const fila of filas) {
    if (fila[0][2]) { // título de sección
      const t = texturaTexto(fila[0][0], 360, 40, 'bold 22px sans-serif', '#1d1813', '#e8a33d');
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.02),
        new THREE.MeshBasicMaterial({ map: t.tx, transparent: true }));
      m.position.set(0, cy, 0.002);
      menuObjetoXR.add(m);
    } else {
      const ncol = fila.length;
      fila.forEach(([etq, acc, , tipo, icono], i) => {
        const w = anchoPanel / ncol - 0.005;
        const px = (-anchoPanel / 2) + w / 2 + i * (anchoPanel / ncol) + 0.0025;
        if (tipo === 'lbl') {
          const t = texturaTexto(etq, 256, 80, 'bold 30px sans-serif', '#26211c', '#ece5dc', icono);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, bh),
            new THREE.MeshBasicMaterial({ map: t.tx, transparent: true }));
          m.position.set(px, cy, 0.003);
          menuObjetoXR.add(m);
        } else {
          const btn = crearBotonXR(etq, acc, w, bh, 'bold 26px sans-serif');
          btn.position.set(px, cy, 0.003);
          menuObjetoXR.add(btn);
          botonesObjeto.push(btn);
        }
      });
    }
    cy -= bh + gy;
  }
}

function abrirMenuObjeto() {
  if (menuObjetoXR.visible) { menuObjetoXR.visible = false; return; }
  if (!muebleGroup) return;
  construirMenuObjeto();
  colocarPanelFrente(menuObjetoXR, 0.55, -0.02);
}

// ---------- Modo "4 puntos": medir un espacio y encajar el mueble ----------
// Señalas 4 esquinas con el gatillo: A y B arriba, C y D abajo. El mueble
// toma ese ancho y alto, queda alineado a la pared y mirando hacia ti.
const puntosMedidos = [];
const marcadoresPuntos = new THREE.Group();
scene.add(marcadoresPuntos);
let modoPuntos = false;

function alternarCuatroPuntos() {
  modoPuntos = !modoPuntos;
  puntosMedidos.length = 0;
  marcadoresPuntos.clear();
  btn4Puntos.userData.activo = modoPuntos;
  btn4Puntos.userData.setLabel(modoPuntos ? 'Punto A…' : '📐 4 puntos');
  if (modoPuntos) menuXR.visible = false; // despeja la vista para apuntar
}

function registrarPunto(pos) {
  const letras = ['A', 'B', 'C', 'D'];
  const marca = new THREE.Group();
  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x6fc3ff })
  );
  marca.add(esfera);
  const rotulo = texturaTexto(letras[puntosMedidos.length], 96, 96, 'bold 60px sans-serif', '#14110e', '#6fc3ff');
  const placa = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, 0.05),
    new THREE.MeshBasicMaterial({ map: rotulo.tx, transparent: true })
  );
  placa.position.y = 0.06;
  marca.add(placa);
  marca.position.copy(pos);
  marcadoresPuntos.add(marca);
  puntosMedidos.push(pos.clone());

  const letrasSig = ['Punto B…', 'Punto C…', 'Punto D…'];
  if (puntosMedidos.length < 4) {
    btn4Puntos.userData.setLabel(letrasSig[puntosMedidos.length - 1]);
    return;
  }
  aplicarCuatroPuntos();
}

function aplicarCuatroPuntos() {
  const [A, B, C, D] = puntosMedidos;
  guardarHistorial();
  marcarMovimiento();

  // Medidas del hueco señalado
  const anchoArr = Math.hypot(B.x - A.x, B.z - A.z);
  const anchoAbj = Math.hypot(D.x - C.x, D.z - C.z);
  const anchoMM = Math.round(((anchoArr + anchoAbj) / 2) * 1000 / 10) * 10;
  const altoMM = Math.round(((A.y + B.y) / 2 - (C.y + D.y) / 2) * 1000 / 10) * 10;
  const elAncho = $('ancho'), elAlto = $('alto');
  elAncho.value = Math.max(+elAncho.min, Math.min(+elAncho.max, anchoMM));
  elAlto.value = Math.max(+elAlto.min, Math.min(+elAlto.max, altoMM));
  reconstruir();

  // Orientación: la línea A→B marca la pared; el frente mira al usuario
  const cam = renderer.xr.getCamera().position;
  const nx = -(B.z - A.z), nz = B.x - A.x; // perpendicular a la pared
  let n = new THREE.Vector3(nx, 0, nz).normalize();
  const centro = new THREE.Vector3(
    (A.x + B.x + C.x + D.x) / 4, 0, (A.z + B.z + C.z + D.z) / 4
  );
  if (n.dot(new THREE.Vector3(cam.x - centro.x, 0, cam.z - centro.z)) < 0) n.negate();

  // El centro del mueble queda media profundidad por delante de la pared
  const halfD = dimsAct.prof / 2000 * escalaMueble;
  muebleGroup.position.set(centro.x + n.x * halfD, 0, centro.z + n.z * halfD);
  muebleGroup.rotation.set(0, Math.atan2(n.x, n.z), 0);

  // Altura: base contra el piso si marcaste abajo, tapa contra el techo si
  // marcaste arriba, o a la altura exacta de los puntos si es a media pared.
  const yBase = (C.y + D.y) / 2;
  const yTope = (A.y + B.y) / 2;
  const piso = nivelPiso();
  const tec = nivelTecho();
  const H = dimsAct.alto / 1000 * escalaMueble;
  if (yBase - piso <= 0.15) {
    alturaLibre = false;
    muebleGroup.position.y = piso;            // base asentada en el piso
  } else if (tec !== null && tec - yTope <= 0.15) {
    alturaLibre = true;
    muebleGroup.position.y = tec - H;         // tapa pegada al techo
  } else {
    alturaLibre = true;
    muebleGroup.position.y = yBase;           // módulo aéreo a la altura marcada
  }
  restringirPosicion();

  modoPuntos = false;
  btn4Puntos.userData.activo = false;
  btn4Puntos.userData.setLabel('📐 4 puntos');
  // Los marcadores quedan visibles unos segundos como comprobación
  setTimeout(() => { marcadoresPuntos.clear(); puntosMedidos.length = 0; }, 6000);
}

function abrirMenu() {
  colocarPanelFrente(menuXR, 0.55, -0.04);
}

function alternarMenu() {
  if (menuXR.visible) { menuXR.visible = false; return; }
  // Si está montado en el mando derecho, solo se muestra; si no, flota al frente
  if (menuXR.parent && menuXR.parent !== scene) menuXR.visible = true;
  else abrirMenu();
}

// ---------- Panel de ayuda: mapa de controles ----------
const ayudaXR = new THREE.Group();
ayudaXR.visible = false;
scene.add(ayudaXR);
{
  const cv = document.createElement('canvas');
  cv.width = 760; cv.height = 720;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#14110e';
  ctx.fillRect(0, 0, 760, 720);
  ctx.strokeStyle = '#5a4a35';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 756, 716);
  ctx.fillStyle = '#e8a33d';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('CONTROLES', 30, 52);
  ctx.font = 'bold 24px sans-serif';
  const lineas = [
    ['Clic en piso / pared', 'Colocar el mueble donde apuntas'],
    ['Clic en el mueble', 'Lo agarras: te sigue. Otro clic lo fija'],
    ['Clic IZQ. en puerta o cajón', 'La abre / cierra individualmente'],
    ['Palanca (llevándolo)', 'Acercar / alejar el mueble'],
    ['Gatillo en flechas / centro', 'Mover por un eje o deslizar libre'],
    ['Grip izquierdo / derecho', 'Girar 15° izquierda / derecha'],
    ['Cruceta (sobre panel izq.)', 'Correr el mueble exacto, sin topes'],
    ['Palanca derecha', 'Subir / bajar  (rotar si "Rotar: Sí")'],
    ['A (derecho)', 'Menú general de opciones'],
    ['B (derecho)', 'Opciones de ESTE mueble'],
    ['X / Y (izquierdo)', 'Puertas todas / Deshacer'],
    ['Clic en otro mueble', 'Lo selecciona (gizmo pasa a él)'],
    ['Menú → 📐 4 puntos', 'Medir hueco: A,B arriba y C,D abajo'],
    ['Menú → 🎯 Marcar pared', 'El mueble solo se pega a ESA pared'],
    ['Menú → 📚 Biblioteca', '50 diseños listos, 100 % editables'],
  ];
  lineas.forEach(([k, v], i) => {
    const y = 92 + i * 41;
    ctx.fillStyle = '#e8a33d';
    ctx.fillText(k, 30, y);
    ctx.fillStyle = '#ece5dc';
    ctx.fillText(v, 360, y);
  });
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  ayudaXR.add(new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.474),
    new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.96 })
  ));
}

function alternarAyuda() {
  if (ayudaXR.visible) { ayudaXR.visible = false; return; }
  colocarPanelFrente(ayudaXR, 0.85, 0);
}

// ---------- Panel de DESPIECE + COTIZACIÓN dentro de AR ----------
// Muestra cada pieza (cant × largo×ancho mm = cm), área, herrajes, costo y
// precio de venta. Se redibuja con los datos actuales al abrirlo.
const despieceXR = new THREE.Group();
despieceXR.visible = false;
scene.add(despieceXR);
const despieceCv = document.createElement('canvas');
despieceCv.width = 820; despieceCv.height = 1040;
const despieceTex = new THREE.CanvasTexture(despieceCv);
despieceTex.colorSpace = THREE.SRGBColorSpace;
despieceXR.add(new THREE.Mesh(
  new THREE.PlaneGeometry(0.52, 0.66),
  new THREE.MeshBasicMaterial({ map: despieceTex, transparent: true, opacity: 0.97 })
));

function dibujarDespieceXR(d) {
  const ctx = despieceCv.getContext('2d');
  const W = despieceCv.width, H = despieceCv.height;
  ctx.fillStyle = '#14110e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#5a4a35'; ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = '#e8a33d';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('DESPIECE', 26, 50);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#a89c8e';
  ctx.fillText(`${NOMBRES_TIPO[$('tipo').value] ?? ''} · ${d.totalPiezas} piezas · ${d.areaPiezas.toFixed(2)} m²`, 26, 80);

  // Encabezados de tabla
  let y = 122;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#e8a33d';
  ctx.fillText('Pieza', 26, y);
  ctx.fillText('Cant', 300, y);
  ctx.fillText('Largo×Ancho (cm)', 370, y);
  ctx.fillText('m²', 700, y);
  ctx.strokeStyle = '#3a322a'; ctx.beginPath(); ctx.moveTo(26, y + 8); ctx.lineTo(W - 26, y + 8); ctx.stroke();
  y += 34;

  ctx.font = '20px sans-serif';
  for (const f of d.filas) {
    if (y > H - 360) { ctx.fillStyle = '#a89c8e'; ctx.fillText('…', 26, y); break; }
    ctx.fillStyle = '#ece5dc';
    ctx.fillText(f.nombre + (f.esLamina ? '' : ' *'), 26, y);
    ctx.fillText(`${f.cant}`, 308, y);
    // mm → cm con un decimal
    ctx.fillText(`${(f.largo / 10).toFixed(1)} × ${(f.ancho / 10).toFixed(1)}  (${f.largo}×${f.ancho} mm)`, 370, y);
    ctx.fillText(f.areaTotal.toFixed(2), 700, y);
    y += 30;
  }

  // Herrajes
  y += 10;
  ctx.strokeStyle = '#3a322a'; ctx.beginPath(); ctx.moveTo(26, y - 18); ctx.lineTo(W - 26, y - 18); ctx.stroke();
  ctx.fillStyle = '#e8a33d'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('HERRAJES', 26, y + 6); y += 34;
  ctx.fillStyle = '#ece5dc'; ctx.font = '20px sans-serif';
  const hl = [];
  if (d.herr.bisagras) hl.push(`Bisagras: ${d.herr.bisagras}`);
  if (d.herr.correderas) hl.push(`Correderas: ${d.herr.correderas} pares`);
  if (d.herr.tornillos) hl.push(`Tornillos: ${d.herr.tornillos}`);
  if (d.herr.tarugos) hl.push(`Tarugos: ${d.herr.tarugos}`);
  ctx.fillText(hl.join('   ·   ') || 'Sin herrajes', 26, y); y += 26;
  ctx.fillText(`Canto: ${d.cantoTotal.toFixed(1)} m   ·   Tableros: ${d.corte.nLaminas}   ·   Aprov: ${d.corte.aprovechamiento.toFixed(0)}%`, 26, y);
  y += 34;

  // Cotización
  ctx.strokeStyle = '#3a322a'; ctx.beginPath(); ctx.moveTo(26, y - 18); ctx.lineTo(W - 26, y - 18); ctx.stroke();
  ctx.fillStyle = '#e8a33d'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('COTIZACIÓN', 26, y + 6); y += 36;
  ctx.font = '20px sans-serif';
  if (!d.hayPrecios) {
    ctx.fillStyle = '#a89c8e';
    ctx.fillText('Ingresa los precios en el PC para ver costos y venta.', 26, y);
  } else {
    ctx.fillStyle = '#ece5dc';
    const filasCosto = [
      ['Tableros', d.costoTableros], ['Canto', d.costoCanto],
      ['Herrajes', d.costoHerrajes], ['Mano de obra', d.costoMO],
    ].filter(([, v]) => v > 0);
    for (const [k, v] of filasCosto) { ctx.fillText(`${k}:`, 26, y); ctx.fillText(fmt(v), 320, y); y += 28; }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Costo total:', 26, y); ctx.fillText(fmt(d.costoTotal), 320, y); y += 36;
    ctx.fillStyle = '#7fd069';
    ctx.fillText(`Venta (${Math.round(d.margen * 100)}%):`, 26, y); ctx.fillText(fmt(d.precioVenta), 320, y); y += 32;
    ctx.fillStyle = '#a89c8e'; ctx.font = '18px sans-serif';
    ctx.fillText(`Ganancia: ${fmt(d.ganancia)}`, 26, y); y += 26;
    ctx.fillText('Sugerencias: ' + d.sugerencias.map(s => `${Math.round(s.m*100)}%=${fmt(s.venta)}`).join('  '), 26, y);
  }
  despieceTex.needsUpdate = true;
}

function alternarDespieceXR() {
  if (despieceXR.visible) { despieceXR.visible = false; return; }
  if (!datosDespiece) return;
  dibujarDespieceXR(datosDespiece);
  colocarPanelFrente(despieceXR, 0.8, 0);
}

// ---------- Selector de muebles con miniaturas 3D ----------
const selectorXR = new THREE.Group();
selectorXR.visible = false;
scene.add(selectorXR);
const botonesSelector = [];
{
  const MINIS = [
    ['bajo', 'Bajo', { tipo: 'bajo', ancho: 800, alto: 900, prof: 550, espesor: 18, entrepanos: 1, puertas: 2, cajones: 3, zocalo: 100, apertura: 'lateral' }],
    ['alacena', 'Alacena', { tipo: 'alacena', ancho: 800, alto: 700, prof: 350, espesor: 18, entrepanos: 1, puertas: 2, cajones: 3, zocalo: 0, apertura: 'lateral' }],
    ['closet', 'Clóset', { tipo: 'closet', ancho: 1200, alto: 2200, prof: 600, espesor: 18, entrepanos: 3, puertas: 2, cajones: 3, zocalo: 80, apertura: 'lateral' }],
    ['comoda', 'Cómoda', { tipo: 'comoda', ancho: 800, alto: 900, prof: 500, espesor: 18, entrepanos: 0, puertas: 0, cajones: 3, zocalo: 80, apertura: 'lateral' }],
    ['mesa', 'Mesa', { tipo: 'mesa', ancho: 1200, alto: 750, prof: 800, espesor: 25, entrepanos: 0, puertas: 0, cajones: 0, zocalo: 0, apertura: 'lateral' }],
  ];
  const fondoSel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.27),
    new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.88 })
  );
  fondoSel.position.y = -0.02;
  selectorXR.add(fondoSel);
  // Acceso a la biblioteca de 50 diseños profesionales
  const btnBiblio = crearBotonXR('📚 Biblioteca: 50 diseños…', () => {
    selectorXR.visible = false;
    alternarBiblioXR();
  }, 0.3, 0.03, 'bold 24px sans-serif');
  btnBiblio.position.set(0, -0.122, 0.003);
  selectorXR.add(btnBiblio);
  botonesSelector.push(btnBiblio);
  const tituloSel = texturaTexto('Elige el mueble', 320, 48, 'bold 26px sans-serif', '#14110e', '#e8a33d');
  const tSel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.02),
    new THREE.MeshBasicMaterial({ map: tituloSel.tx, transparent: true })
  );
  tSel.position.set(0, 0.094, 0.002);
  selectorXR.add(tSel);

  const matsMini = obtenerMateriales('roble');
  MINIS.forEach(([id, nombre, prm], i) => {
    const x = (i - 2) * 0.112;
    // Miniatura 3D real del mueble
    const mini = new THREE.Group();
    for (const pz of generarPiezas(prm)) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...pz.size),
        pz.veta === 'h' ? matsMini.h : matsMini.v
      );
      mesh.position.set(...pz.pos);
      mini.add(mesh);
    }
    mini.scale.setScalar(0.085 / Math.max(prm.ancho, prm.alto, prm.prof));
    mini.position.set(x, -0.028, 0.014);
    mini.rotation.y = 0.55;
    selectorXR.add(mini);
    // Botón con el nombre, debajo de la miniatura
    const btn = crearBotonXR(nombre, () => {
      guardarHistorial();
      $('tipo').value = id;
      reconstruir();
      selectorXR.visible = false;
    }, 0.1, 0.026, 'bold 28px sans-serif');
    btn.position.set(x, -0.082, 0.003);
    btn.userData.tipoSel = id;
    selectorXR.add(btn);
    botonesSelector.push(btn);
  });
}

function alternarSelector() {
  if (selectorXR.visible) { selectorXR.visible = false; return; }
  for (const b of botonesSelector) b.userData.activo = (b.userData.tipoSel === $('tipo').value);
  colocarPanelFrente(selectorXR, 0.65, -0.02);
}

// ---------- 📚 Biblioteca de 50 diseños DENTRO de las gafas ----------
// Dos niveles: primero las 5 categorías, luego los 10 diseños de cada una.
// Al tocar un diseño se carga en el mueble activo, 100 % editable.
const biblioXR = new THREE.Group();
biblioXR.visible = false;
scene.add(biblioXR);
let botonesBiblio = [];

function limpiarBiblioXR() {
  for (const c of [...biblioXR.children]) {
    biblioXR.remove(c);
    c.geometry?.dispose?.();
    c.material?.map?.dispose?.();
    c.material?.dispose?.();
  }
  botonesBiblio = [];
}

function construirBiblioXR(cat) {
  limpiarBiblioXR();
  const corto = (s) => s.length > 24 ? s.slice(0, 23) + '…' : s;
  let items;
  if (!cat) {
    items = [...new Set(PLANTILLAS.map(t => t.cat))]
      .map(c => [`📐 ${c}`, () => construirBiblioXR(c)]);
  } else {
    items = PLANTILLAS
      .map((t) => t.cat === cat
        ? [corto(t.nombre), () => {
            guardarHistorial();
            cargarProyecto({ params: t.params, material: t.material }, t.nombre);
            biblioXR.visible = false;
          }]
        : null)
      .filter(Boolean);
    items.push(['◀ Volver', () => construirBiblioXR(null)]);
  }

  // Categorías: 1 columna ancha. Diseños: 2 columnas → panel bajo y cómodo.
  const cols = cat ? 2 : 1;
  const bw = cat ? 0.17 : 0.30;
  const bh = 0.038, gx = 0.008, paso = 0.044;
  const filas = Math.ceil(items.length / cols);
  const alto = filas * paso + 0.09;
  const ancho = cat ? 0.37 : 0.34;
  const fondo = new THREE.Mesh(
    new THREE.PlaneGeometry(ancho, alto),
    new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.92 })
  );
  biblioXR.add(fondo);
  const tit = texturaTexto(cat ? corto(cat) : '📚 Biblioteca Florenza', 460, 48,
    'bold 26px sans-serif', '#1d1813', '#e8a33d');
  const titM = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.024),
    new THREE.MeshBasicMaterial({ map: tit.tx, transparent: true })
  );
  titM.position.set(0, alto / 2 - 0.032, 0.002);
  biblioXR.add(titM);
  items.forEach(([etq, acc], i) => {
    const col = i % cols, fila = Math.floor(i / cols);
    const x = cols === 2 ? (col - 0.5) * (bw + gx) : 0;
    const btn = crearBotonXR(etq, acc, bw, bh, cat ? 'bold 25px sans-serif' : 'bold 30px sans-serif');
    btn.position.set(x, alto / 2 - 0.078 - fila * paso, 0.003);
    biblioXR.add(btn);
    botonesBiblio.push(btn);
  });
}

function alternarBiblioXR() {
  if (biblioXR.visible) { biblioXR.visible = false; return; }
  construirBiblioXR(null);
  colocarPanelFrente(biblioXR, 0.7, -0.02);
}

// ---------- Cruceta (mando derecho): deslizar el mueble SIN topes ----------
// ◀ ▶ lo corren a lo largo de su propio frente (paralelo a la pared cuando
// está alineado) y ▲ ▼ lo suben / bajan. Ignora a propósito los topes de
// pared, para que ningún plano "imaginario" del escaneo frene el recorrido.
// El botón ⌂ del centro lo asienta en el piso.
const crucetaXR = new THREE.Group();
crucetaXR.visible = false;
const botonesCruceta = [];
{
  const fondoCr = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.13),
    new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.8 })
  );
  crucetaXR.add(fondoCr);
  const PASO = 0.025; // 2,5 cm por toque
  const defs = [
    ['▲', 0, 0.044, () => moverLocal(0, PASO)],
    ['▼', 0, -0.044, () => moverLocal(0, -PASO)],
    ['◀', -0.044, 0, () => moverLocal(-PASO, 0)],
    ['▶', 0.044, 0, () => moverLocal(PASO, 0)],
    ['⌂', 0, 0, () => alPiso()],
  ];
  for (const [etq, x, y, acc] of defs) {
    const b = crearBotonXR(etq, acc, 0.038, 0.038, 'bold 46px sans-serif');
    b.position.set(x, y, 0.003);
    crucetaXR.add(b);
    botonesCruceta.push(b);
  }
  // Debajo de la cruceta: giro por grados y eliminar el mueble
  const giroIzq = crearBotonXR('⟲ 15°', () => girarMueble(15), 0.06, 0.028);
  giroIzq.position.set(-0.034, -0.092, 0.003);
  crucetaXR.add(giroIzq);
  botonesCruceta.push(giroIzq);
  const giroDer = crearBotonXR('⟳ 15°', () => girarMueble(-15), 0.06, 0.028);
  giroDer.position.set(0.034, -0.092, 0.003);
  crucetaXR.add(giroDer);
  botonesCruceta.push(giroDer);
  const btnEliminar = crearBotonXR('🗑 Eliminar', () => quitarMueble(), 0.095, 0.028);
  btnEliminar.position.set(0, -0.126, 0.003);
  crucetaXR.add(btnEliminar);
  botonesCruceta.push(btnEliminar);
}
// La cruceta vive ENCIMA del panel de medidas (mano izquierda), sin taparlo.
// Subida un poco más para que no estorbe (incluye ◀▶▲▼, 15° y Eliminar).
panelXR.add(crucetaXR);
crucetaXR.position.set(0, 0.28, 0.002);
crucetaXR.rotation.set(0, 0, 0);

function moverLocal(dx, dy) {
  if (!muebleGroup) return;
  guardarHistorial();
  marcarMovimiento();
  if (dx) {
    // Eje X local del mueble: paralelo a la pared cuando está de espaldas
    const yaw = muebleGroup.rotation.y;
    muebleGroup.position.x += Math.cos(yaw) * dx;
    muebleGroup.position.z -= Math.sin(yaw) * dx;
  }
  if (dy) {
    muebleGroup.position.y += dy;
    alturaLibre = muebleGroup.position.y > nivelPiso() + 0.02;
  }
  // Sin topes de pared a propósito: solo respeta el piso
  if (!alturaLibre) muebleGroup.position.y = nivelPiso();
  else muebleGroup.position.y = Math.max(nivelPiso(), muebleGroup.position.y);
}

// ---------- Gizmo interactivo ----------
// Manijas agarrables con el gatillo: flechas = mover en ese eje exacto,
// aro = rotar, columna azul = subir/bajar. La flecha VERDE marca el frente
// del mueble (el lado de las puertas). Esfera naranja = centro.
const gizmo = new THREE.Group();
gizmo.visible = false;
scene.add(gizmo);
const gizmoMangos = []; // colisionadores invisibles para el rayo
const etiquetasGizmo = []; // { dibujar, dim } placas de medida en las flechas
let gizmoDrag = null;   // {ctrl, tipo, d, P0, t0, yaw0, ang0}

function visualMango(hit, visuales, colorBase) {
  hit.userData.visuales = visuales;
  for (const v of visuales) v.userData.colorBase = colorBase;
}

{
  const NARANJA = 0xe8a33d, VERDE = 0x7fd069, AZUL = 0x6fc3ff;
  // Disco base sutil
  const disco = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: NARANJA, transparent: true, opacity: 0.07, depthWrite: false })
  );
  disco.position.y = 0.004;
  gizmo.add(disco);

  // (El aro de rotación se quitó a pedido del usuario: girar es con los
  //  grips, los botones ⟲/⟳ o la palanca en modo "Rotar: Sí".)

  // Flechas de movimiento (palo + punta). La verde es el FRENTE.
  const flecha = (dirLocal, color, dim, etiqueta) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color });
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10).rotateX(Math.PI / 2), mat);
    palo.position.set(0, 0.014, 0.63);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 14).rotateX(Math.PI / 2), mat);
    punta.position.set(0, 0.014, 0.79);
    g.add(palo, punta);
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.12, 0.38),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(0, 0.04, 0.7);
    hit.userData.tipo = 'mover';
    hit.userData.dirLocal = dirLocal.clone();
    visualMango(hit, [palo, punta], color);
    g.add(hit);
    gizmoMangos.push(hit);
    // Placa con la medida (ej. "Ancho 800 mm") al final de la flecha
    if (dim) {
      const t = texturaTexto(etiqueta, 256, 64, 'bold 30px sans-serif', '#14110e', '#f1ebe2');
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05),
        new THREE.MeshBasicMaterial({ map: t.tx, transparent: true }));
      placa.position.set(0, 0.10, 0.7);
      g.add(placa);
      etiquetasGizmo.push({ dibujar: t.dibujar, dim, etiqueta });
    }
    g.rotation.y = Math.atan2(dirLocal.x, dirLocal.z);
    gizmo.add(g);
  };
  flecha(new THREE.Vector3(0, 0, 1), VERDE, 'frente', 'FRENTE');   // lado de puertas
  flecha(new THREE.Vector3(0, 0, -1), NARANJA, 'prof', 'Prof.');
  flecha(new THREE.Vector3(1, 0, 0), NARANJA, 'ancho', 'Ancho');
  flecha(new THREE.Vector3(-1, 0, 0), NARANJA, 'ancho', 'Ancho');

  // Columna vertical azul: subir / bajar
  {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: AZUL });
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 10), mat);
    palo.position.y = 0.22;
    const arriba = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 14), mat);
    arriba.position.y = 0.43;
    const abajo = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 14).rotateX(Math.PI), mat);
    abajo.position.y = 0.06;
    g.add(palo, arriba, abajo);
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.55, 0.16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = 0.25;
    hit.userData.tipo = 'subir';
    visualMango(hit, [palo, arriba, abajo], AZUL);
    g.add(hit);
    gizmoMangos.push(hit);
    const t = texturaTexto('Alto', 256, 64, 'bold 30px sans-serif', '#14110e', '#f1ebe2');
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05),
      new THREE.MeshBasicMaterial({ map: t.tx, transparent: true }));
    placa.position.set(0, 0.52, 0);
    g.add(placa);
    etiquetasGizmo.push({ dibujar: t.dibujar, dim: 'alto', etiqueta: 'Alto' });
    g.position.set(0.45, 0, 0.45); // en diagonal, sin tapar las flechas
    gizmo.add(g);
  }

  // Centro del mueble: PIVOTE agarrable — lo tomas con el gatillo y
  // arrastras el mueble desde su centro (sin cambiar altura ni giro)
  const centro = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 14, 10),
    new THREE.MeshBasicMaterial({ color: NARANJA })
  );
  centro.position.y = 0.02;
  gizmo.add(centro);
  const centroHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  centroHit.position.y = 0.02;
  centroHit.userData.tipo = 'centro';
  visualMango(centroHit, [centro], NARANJA);
  gizmo.add(centroHit);
  gizmoMangos.push(centroHit);
}

function actualizarGizmo() {
  if (!renderer.xr.isPresenting || !muebleGroup) { gizmo.visible = false; return; }
  gizmo.visible = true;
  // El gizmo acompaña la base del mueble, aunque esté elevado (alacenas).
  // Tamaño FIJO en el mundo (no escala con el mueble): siempre limpio y parejo.
  // El PIVOTE va en la parte TRASERA del mueble (la espalda que se pega a la
  // pared), no en el centro. Se desplaza hacia atrás media profundidad.
  const yaw = muebleGroup.rotation.y;
  const profM = dimsAct.prof / 2000; // media profundidad en metros
  gizmo.position.set(
    muebleGroup.position.x - Math.sin(yaw) * profM,
    muebleGroup.position.y,
    muebleGroup.position.z - Math.cos(yaw) * profM
  );
  gizmo.rotation.y = yaw;
  gizmo.scale.setScalar(0.8);
  // Actualiza las etiquetas de medida (ancho/prof/alto) con los valores reales
  if (!gizmo.userData.dim || gizmo.userData.dim !== `${dimsAct.ancho}|${dimsAct.alto}|${dimsAct.prof}`) {
    gizmo.userData.dim = `${dimsAct.ancho}|${dimsAct.alto}|${dimsAct.prof}`;
    for (const e of etiquetasGizmo) {
      if (e.dim === 'frente') e.dibujar('FRENTE');
      else e.dibujar(`${e.etiqueta} ${dimsAct[e.dim]} mm`);
    }
  }
}

// --- Interacción del gizmo ---
const _rayGizmo = new THREE.Raycaster();
function intersecarGizmo(ctrl) {
  if (!gizmo.visible) return null;
  _rayGizmo.ray.copy(rayoDe(ctrl).ray);
  const hits = _rayGizmo.intersectObjects(gizmoMangos, false);
  return hits.length ? hits[0].object : null;
}

const _w0 = new THREE.Vector3();
// t del punto del eje (P0 + t·d) más cercano al rayo del control
function paramEje(P0, d, rayo) {
  _w0.subVectors(P0, rayo.origin);
  const b = d.dot(rayo.direction);
  const den = 1 - b * b;
  if (Math.abs(den) < 1e-4) return null;
  return (b * rayo.direction.dot(_w0) - d.dot(_w0)) / den;
}

function anguloEnPlano(rayo, P0) {
  if (Math.abs(rayo.direction.y) < 0.02) return null;
  const t = (P0.y + 0.01 - rayo.origin.y) / rayo.direction.y;
  if (t < 0) return null;
  const px = rayo.origin.x + rayo.direction.x * t;
  const pz = rayo.origin.z + rayo.direction.z * t;
  return Math.atan2(px - P0.x, pz - P0.z);
}

// Punto donde el rayo cruza un plano horizontal a la altura yPlano
function puntoEnPlano(rayo, yPlano) {
  if (Math.abs(rayo.direction.y) < 0.02) return null;
  const t = (yPlano - rayo.origin.y) / rayo.direction.y;
  if (t < 0) return null;
  return new THREE.Vector3(
    rayo.origin.x + rayo.direction.x * t,
    yPlano,
    rayo.origin.z + rayo.direction.z * t
  );
}

function iniciarGizmo(ctrl, mango) {
  guardarHistorial();
  marcarMovimiento();
  const u = mango.userData;
  const P0 = muebleGroup.position.clone();
  const ray = rayoDe(ctrl).ray;
  if (u.tipo === 'rotar') {
    const ang0 = anguloEnPlano(ray, P0);
    gizmoDrag = { ctrl, tipo: 'rotar', P0, yaw0: muebleGroup.rotation.y, ang0: ang0 ?? 0 };
  } else if (u.tipo === 'centro') {
    const hit0 = puntoEnPlano(ray, P0.y + 0.02);
    gizmoDrag = { ctrl, tipo: 'centro', P0, hit0: hit0 ?? P0.clone() };
  } else {
    const d = u.tipo === 'subir'
      ? new THREE.Vector3(0, 1, 0)
      : u.dirLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), muebleGroup.rotation.y);
    gizmoDrag = { ctrl, tipo: u.tipo, d, P0, t0: paramEje(P0, d, ray) ?? 0 };
  }
  pulso(ctrl);
}

function procesarGizmo() {
  if (!gizmoDrag || !muebleGroup) return;
  const ray = rayoDe(gizmoDrag.ctrl).ray;
  if (gizmoDrag.tipo === 'rotar') {
    const ang = anguloEnPlano(ray, gizmoDrag.P0);
    if (ang === null) return;
    muebleGroup.rotation.y = gizmoDrag.yaw0 + (ang - gizmoDrag.ang0);
  } else if (gizmoDrag.tipo === 'centro') {
    // Arrastre desde el pivote central: se desliza por el plano de su base
    const hit = puntoEnPlano(ray, gizmoDrag.P0.y + 0.02);
    if (!hit) return;
    muebleGroup.position.x = gizmoDrag.P0.x + (hit.x - gizmoDrag.hit0.x);
    muebleGroup.position.z = gizmoDrag.P0.z + (hit.z - gizmoDrag.hit0.z);
  } else {
    const t = paramEje(gizmoDrag.P0, gizmoDrag.d, ray);
    if (t === null) return;
    const delta = THREE.MathUtils.clamp(t - gizmoDrag.t0, -5, 5);
    muebleGroup.position.copy(gizmoDrag.P0).addScaledVector(gizmoDrag.d, delta);
    if (gizmoDrag.tipo === 'subir') {
      alturaLibre = muebleGroup.position.y > nivelPiso() + 0.05;
    }
  }
  marcarMovimiento();
  restringirPosicion();
}

// ---------- Malla del espacio (escaneo de la habitación, como Layout) ----------
const mallaGroup = new THREE.Group();
mallaGroup.visible = false;
scene.add(mallaGroup);
const matMalla = new THREE.MeshBasicMaterial({ color: 0xe8a33d, wireframe: true, transparent: true, opacity: 0.22 });
const matContorno = new THREE.LineBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0.85 });
const matContornoSel = new THREE.LineBasicMaterial({ color: 0x7fd069, transparent: true, opacity: 1 });

// La pared marcada (🎯) se pinta SIEMPRE en verde, aunque la malla esté oculta
const vizParedMesh = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ color: 0x7fd069, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
);
vizParedMesh.matrixAutoUpdate = false;
vizParedMesh.visible = false;
scene.add(vizParedMesh);
const vizParedBorde = new THREE.LineLoop(new THREE.BufferGeometry(), matContornoSel);
vizParedBorde.matrixAutoUpdate = false;
vizParedBorde.visible = false;
scene.add(vizParedBorde);
let vizParedVersion = -1;

function actualizarParedMarcada(frame) {
  if (!paredMarcada) {
    vizParedMesh.visible = vizParedBorde.visible = false;
    return;
  }
  const pose = frame.getPose(paredMarcada.planeSpace, renderer.xr.getReferenceSpace());
  if (!pose) {
    vizParedMesh.visible = vizParedBorde.visible = false;
    return;
  }
  if (vizParedVersion !== paredMarcada.lastChangedTime) {
    vizParedVersion = paredMarcada.lastChangedTime;
    const pts = paredMarcada.polygon.map(pt => new THREE.Vector3(pt.x, 0, pt.z));
    vizParedBorde.geometry.dispose();
    vizParedBorde.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    vizParedMesh.geometry.dispose();
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const idx = [];
    for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
    geo.setIndex(idx);
    vizParedMesh.geometry = geo;
  }
  vizParedMesh.matrix.fromArray(pose.transform.matrix);
  vizParedBorde.matrix.fromArray(pose.transform.matrix);
  vizParedMesh.visible = vizParedBorde.visible = true;
}
const mallasXR = new Map();    // XRMesh  → THREE.Mesh
const contornosXR = new Map(); // XRPlane → THREE.LineLoop

function actualizarMallas(frame) {
  const ref = renderer.xr.getReferenceSpace();
  if (frame.detectedMeshes) {
    for (const [xrM, mesh] of mallasXR) {
      if (!frame.detectedMeshes.has(xrM)) {
        mallaGroup.remove(mesh);
        mesh.geometry.dispose();
        mallasXR.delete(xrM);
      }
    }
    frame.detectedMeshes.forEach((m) => {
      let mesh = mallasXR.get(m);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.BufferGeometry(), matMalla);
        mesh.matrixAutoUpdate = false;
        mesh.userData.version = -1;
        mallaGroup.add(mesh);
        mallasXR.set(m, mesh);
      }
      if (mesh.userData.version !== m.lastChangedTime) {
        mesh.geometry.dispose();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(m.vertices, 3));
        geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
        mesh.geometry = geo;
        mesh.userData.version = m.lastChangedTime;
      }
      const pose = frame.getPose(m.meshSpace, ref);
      if (pose) mesh.matrix.fromArray(pose.transform.matrix);
    });
  }
  if (frame.detectedPlanes) {
    for (const [xrP, linea] of contornosXR) {
      if (!frame.detectedPlanes.has(xrP)) {
        mallaGroup.remove(linea);
        linea.geometry.dispose();
        contornosXR.delete(xrP);
      }
    }
    frame.detectedPlanes.forEach((pl) => {
      let linea = contornosXR.get(pl);
      if (!linea) {
        linea = new THREE.LineLoop(new THREE.BufferGeometry(), matContorno);
        linea.matrixAutoUpdate = false;
        linea.userData.version = -1;
        mallaGroup.add(linea);
        contornosXR.set(pl, linea);
      }
      if (linea.userData.version !== pl.lastChangedTime) {
        linea.geometry.dispose();
        linea.geometry = new THREE.BufferGeometry().setFromPoints(
          pl.polygon.map(pt => new THREE.Vector3(pt.x, 0, pt.z))
        );
        linea.userData.version = pl.lastChangedTime;
      }
      linea.material = (pl === paredMarcada) ? matContornoSel : matContorno;
      const pose = frame.getPose(pl.planeSpace, ref);
      if (pose) linea.matrix.fromArray(pose.transform.matrix);
    });
  }
}

function limpiarMallas() {
  for (const [, mesh] of mallasXR) { mallaGroup.remove(mesh); mesh.geometry.dispose(); }
  for (const [, linea] of contornosXR) { mallaGroup.remove(linea); linea.geometry.dispose(); }
  mallasXR.clear();
  contornosXR.clear();
}

// ---------- Paredes y techo (para alinear, pegar y frenar el mueble) ----------
function actualizarParedes(frame) {
  if (!frame.detectedPlanes) return;
  const ref = renderer.xr.getReferenceSpace();
  const cam = renderer.xr.getCamera().position;
  const nuevas = [];
  let mejorTecho = null;
  let mejorPiso = null;
  let topeParedes = null;
  const q = new THREE.Quaternion();
  const mPose = new THREE.Matrix4();
  const vPol = new THREE.Vector3();
  frame.detectedPlanes.forEach((pl) => {
    const pose = frame.getPose(pl.planeSpace, ref);
    if (!pose) return;
    if (pl.orientation === 'horizontal') {
      // Alturas RELATIVAS a la cabeza del usuario: el origen del visor no
      // siempre coincide con el piso real, así que no se confía en y=0.
      const yPl = pose.transform.position.y;
      if (yPl > cam.y + 0.3) mejorTecho = mejorTecho === null ? yPl : Math.min(mejorTecho, yPl);
      else if (yPl < cam.y - 1.0) mejorPiso = mejorPiso === null ? yPl : Math.min(mejorPiso, yPl);
      return;
    }
    if (pl.orientation !== 'vertical') return;
    const o = pose.transform.orientation, t = pose.transform.position;
    q.set(o.x, o.y, o.z, o.w);
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    n.y = 0;
    if (n.lengthSq() < 1e-4) return;
    n.normalize();
    const punto = new THREE.Vector3(t.x, t.y, t.z);
    // La normal debe apuntar hacia adentro de la habitación (hacia el usuario)
    if (n.dot(new THREE.Vector3(cam.x - punto.x, 0, cam.z - punto.z)) < 0) n.negate();
    nuevas.push({ normal: n, punto, yaw: Math.atan2(n.x, n.z), plano: pl });
    // Borde superior de la pared, por si el techo no llega como plano
    if (pl.polygon) {
      mPose.fromArray(pose.transform.matrix);
      for (const pt of pl.polygon) {
        vPol.set(pt.x, pt.y, pt.z).applyMatrix4(mPose);
        if (topeParedes === null || vPol.y > topeParedes) topeParedes = vPol.y;
      }
    }
  });
  if (nuevas.length) paredes = nuevas;
  if (mejorTecho !== null) techoPlanos = mejorTecho;
  if (mejorPiso !== null) pisoPlanos = mejorPiso;
  if (topeParedes !== null && topeParedes > cam.y + 0.3) techoParedes = topeParedes;
}

function difAngular(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

// Si hay una pared marcada (🎯), el mueble solo trabaja con ella
function paredesActivas() {
  if (!paredMarcada) return paredes;
  const f = paredes.filter(w => w.plano === paredMarcada);
  return f.length ? f : paredes;
}

// Ajusta el giro a la pared detectada más cercana (o a pasos de 15°)
function alinearYaw(yaw) {
  if (paredesActivas().length) {
    let mejor = yaw, mejorDif = Infinity;
    for (const w of paredesActivas()) {
      for (let k = 0; k < 4; k++) {
        const cand = w.yaw + k * Math.PI / 2;
        const d = difAngular(cand, yaw);
        if (d < mejorDif) { mejorDif = d; mejor = cand; }
      }
    }
    return mejor;
  }
  const paso = Math.PI / 12;
  return Math.round(yaw / paso) * paso;
}

// El mueble no atraviesa el piso, el techo ni las paredes detectadas
const _vTmp = new THREE.Vector3();
function restringirPosicion() {
  if (!muebleGroup) return;
  const W = dimsAct.ancho / 1000 * escalaMueble;
  const D = dimsAct.prof / 1000 * escalaMueble;
  const H = dimsAct.alto / 1000 * escalaMueble;
  const yMin = nivelPiso();
  // Predeterminado: asentado en el piso; flota solo si lo elevaste a propósito
  let y = alturaLibre ? Math.max(yMin, muebleGroup.position.y) : yMin;
  if (topesActivos) {
    const tec = nivelTecho();
    if (tec !== null) y = Math.min(y, Math.max(yMin, tec - H));
  }
  muebleGroup.position.y = y;
  if (!topesActivos) return; // "Topes: No" → la malla no limita el movimiento
  for (const w of paredes) {
    const dy = muebleGroup.rotation.y - w.yaw;
    const ext = Math.abs(Math.cos(dy)) * D / 2 + Math.abs(Math.sin(dy)) * W / 2;
    _vTmp.subVectors(muebleGroup.position, w.punto);
    const d = _vTmp.x * w.normal.x + _vTmp.z * w.normal.z;
    const corr = ext - d;
    // Correcciones grandes = plano mal escaneado (puerta, ventana, sala
    // vecina): se ignoran para que el escaneo no "empuje" el mueble.
    if (d < ext - 0.002 && corr < 0.6) muebleGroup.position.addScaledVector(w.normal, corr);
  }
}

function colocarMueble() {
  const pos = new THREE.Vector3(), rot = new THREE.Quaternion(), esc = new THREE.Vector3();
  reticula.matrix.decompose(pos, rot, esc);
  // Si el punto está cerca del piso real, queda a ras; si apuntas a un mesón
  // o mesa, queda apoyado encima.
  const piso = nivelPiso();
  pos.y = (alturaLibre && pos.y - piso > 0.15) ? pos.y : piso; // piso por defecto
  marcarMovimiento();
  muebleGroup.position.copy(pos);
  // SIEMPRE de frente al usuario (sin girarse de lado contra la pared).
  // Para rotarlo se usa la cruceta o los botones ⟲/⟳ manualmente.
  const cam = renderer.xr.getCamera().position;
  muebleGroup.rotation.set(0, Math.atan2(cam.x - pos.x, cam.z - pos.z), 0);
  restringirPosicion();
}

// Pega el mueble a la pared más cercana: espalda contra la pared, a ras.
function pegarAPared(maxHueco) {
  const candidatas = paredesActivas();
  if (!candidatas.length || !muebleGroup) return false;
  const halfD = dimsAct.prof / 2000 * escalaMueble;
  const v = new THREE.Vector3();
  let mejor = null, mejorDist = Infinity;
  for (const w of candidatas) {
    const d = v.subVectors(muebleGroup.position, w.punto).dot(w.normal);
    if (d > -0.05 && d < mejorDist) { mejorDist = d; mejor = w; }
  }
  // Con pared marcada el imán es más generoso (1 m) y solo hacia ESA pared
  const alcance = paredMarcada ? Math.max(maxHueco, 1.0) : maxHueco;
  if (!mejor || mejorDist - halfD > alcance) return false;
  marcarMovimiento();
  muebleGroup.rotation.set(0, mejor.yaw, 0);
  muebleGroup.position.addScaledVector(mejor.normal, -(mejorDist - halfD - 0.003));
  return true;
}

// 🎯 Marcar pared: apuntas a una pared y dispara → esa queda como pared de
// trabajo (contorno verde). El mueble solo se alinea y se pega a ELLA.
function seleccionarParedRayo(ctrl) {
  const ray = rayoDe(ctrl).ray;
  let mejor = null, mejorT = Infinity;
  for (const w of paredes) {
    const denom = w.normal.x * ray.direction.x + w.normal.z * ray.direction.z;
    if (Math.abs(denom) < 1e-3) continue;
    _vTmp.subVectors(w.punto, ray.origin);
    const t = (w.normal.x * _vTmp.x + w.normal.z * _vTmp.z) / denom;
    if (t > 0.3 && t < 12 && t < mejorT) { mejorT = t; mejor = w; }
  }
  if (!mejor || !mejor.plano) return false;
  paredMarcada = mejor.plano;
  vizParedVersion = -1; // fuerza redibujar la pared en verde
  modoMarcarPared = false;
  actualizarBtnPared();
  return true;
}

function actualizarBtnPared() {
  if (!btnPared) return;
  btnPared.userData.activo = !!paredMarcada || modoMarcarPared;
  btnPared.userData.setLabel(
    paredMarcada ? 'Pared fijada ✓' : (modoMarcarPared ? 'Apunta y dispara' : '🎯 Marcar pared')
  );
}

function traerAlFrente() {
  guardarHistorial();
  marcarMovimiento();
  alturaLibre = false;
  const cam = renderer.xr.getCamera();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); else dir.normalize();
  muebleGroup.position.copy(cam.position).addScaledVector(dir, 1.5);
  muebleGroup.position.y = nivelPiso();
  muebleGroup.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0); // de frente al usuario
  restringirPosicion();
}

// ---------- Interacción con los controles ----------
const _matCtrl = new THREE.Matrix4();
const _ray = new THREE.Raycaster();

function rayoDe(ctrl) {
  _matCtrl.identity().extractRotation(ctrl.matrixWorld);
  _ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  _ray.ray.direction.set(0, 0, -1).applyMatrix4(_matCtrl);
  return _ray;
}

function intersecarBoton(ctrl) {
  const lista = [];
  if (panelXR.visible && panelXR.parent) lista.push(...botonesXR);
  if (crucetaXR.visible && crucetaXR.parent) lista.push(...botonesCruceta);
  if (menuXR.visible) lista.push(...botonesMenu);
  if (menuObjetoXR.visible) lista.push(...botonesObjeto);
  if (selectorXR.visible) lista.push(...botonesSelector);
  if (biblioXR.visible) lista.push(...botonesBiblio);
  if (!lista.length) return null;
  const hits = rayoDe(ctrl).intersectObjects(lista, false);
  return hits.length ? hits[0].object : null;
}

function pulso(ctrl) {
  try { ctrl.userData.gamepad?.hapticActuators?.[0]?.pulse(0.4, 40); } catch { /* sin háptica */ }
}

const _posReticula = new THREE.Vector3();
function alSeleccionar(ctrl) {
  const btn = intersecarBoton(ctrl);
  if (btn) { btn.userData.accion(); pulso(ctrl); return; }
  if (menuXR.visible) { menuXR.visible = false; return; } // clic fuera cierra el menú
  if (menuObjetoXR.visible) { menuObjetoXR.visible = false; return; }
  if (selectorXR.visible) { selectorXR.visible = false; return; }
  if (biblioXR.visible) { biblioXR.visible = false; return; }
  if (ayudaXR.visible) { ayudaXR.visible = false; return; }
  if (despieceXR.visible) { despieceXR.visible = false; return; }
  if (modoMarcarPared) {
    if (seleccionarParedRayo(ctrl)) {
      pulso(ctrl);
    } else {
      // No se encontró pared en esa dirección: avisa y deja reintentar
      btnPared?.userData.setLabel('No la encontré, reintenta');
    }
    return;
  }
  if (!reticula.visible) return;
  _posReticula.setFromMatrixPosition(reticula.matrix);
  if (modoPuntos) {
    registrarPunto(_posReticula); // midiendo el hueco: A, B, C, D
    pulso(ctrl);
    return;
  }
  guardarHistorial();
  colocarMueble();
  pulso(ctrl);
}

const lineaPuntero = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
  new THREE.LineBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.55 })
);
lineaPuntero.scale.z = 3;

// Esquema de control simple y predecible:
//   Clic de gatillo apuntando a un punto → el mueble queda FIJO ahí.
//   Gatillo SOSTENIDO apuntando al mueble → lo arrastras por piso y paredes,
//   siempre de frente (puertas hacia ti) y alineado. Joysticks = ajuste fino.
const controlesXR = [];
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  ctrl.visible = false;
  ctrl.add(lineaPuntero.clone());
  ctrl.addEventListener('connected', (e) => {
    ctrl.userData.handedness = e.data.handedness;
    ctrl.userData.gamepad = e.data.gamepad;
    if (e.data.handedness === 'left') grip.add(panelXR); // panel en la mano izquierda
    if (e.data.handedness === 'right') {
      // El menú A/B vive sobre el mando derecho
      grip.add(menuXR);
      menuXR.scale.setScalar(0.8);
      menuXR.position.set(0, 0.32, -0.08);
      menuXR.rotation.set(-0.45, 0, 0);
    }
    // Hit-test desde el rayo del control: la retícula y el arrastre siguen
    // a donde APUNTA EL MANDO, no a la cabeza.
    const session = renderer.xr.getSession();
    if (session && e.data.targetRaySpace) {
      session.requestHitTestSource({ space: e.data.targetRaySpace })
        .then(s => { ctrl.userData.hitSource = s; })
        .catch(() => {});
    }
  });
  ctrl.addEventListener('disconnected', () => { ctrl.userData.hitSource = null; });
  ctrl.addEventListener('selectstart', () => {
    if (!renderer.xr.isPresenting || !muebleGroup) return;
    if (llevando) { llevando.soltar = true; return; } // este clic lo deja fijo
    if (intersecarBoton(ctrl)) return; // los botones se resuelven en 'select'
    if (modoPuntos) return;            // midiendo: el clic registra el punto
    // Prioridad: manijas del gizmo > otro mueble > el mueble activo > colocar
    const mango = intersecarGizmo(ctrl);
    if (mango) {
      iniciarGizmo(ctrl, mango);
      ctrl.userData.fueArrastre = true;
      return;
    }
    const otro = intersecarMuebles(ctrl);
    if (otro) {
      activarMueble(otro); // selecciona ese mueble: el gizmo se pasa a él
      ctrl.userData.fueArrastre = true;
      pulso(ctrl);
      return;
    }
    // Mando IZQUIERDO: su gatillo SOLO abre/cierra puertas y cajones.
    // Nunca agarra ni mueve el mueble (eso es del mando derecho).
    if (ctrl.userData.handedness === 'left') {
      if (alternarApuntado(ctrl)) {
        ctrl.userData.fueArrastre = true;
        pulso(ctrl);
      }
      return;
    }
    if (rayoDe(ctrl).intersectObject(muebleGroup, true).length) {
      guardarHistorial();
      marcarMovimiento();
      llevando = {
        ctrl,
        mano: ctrl.userData.handedness,
        inicio: performance.now(),
        dist: Math.max(0.35, muebleGroup.position.distanceTo(_vTmp.setFromMatrixPosition(ctrl.matrixWorld))),
      };
      ctrl.userData.fueArrastre = true;
      pulso(ctrl);
    }
  });
  ctrl.addEventListener('select', () => {
    if (llevando) {
      if (llevando.soltar) { soltarMueble(); ctrl.userData.fueArrastre = false; return; }
      if (llevando.ctrl === ctrl) {
        ctrl.userData.fueArrastre = false;
        if (performance.now() - llevando.inicio < 350) {
          llevando.persistente = true; // clic corto: queda agarrado al mando
          return;
        }
        soltarMueble(); // lo llevó con el gatillo sostenido y lo soltó
        return;
      }
    }
    if (ctrl.userData.fueArrastre) {
      ctrl.userData.fueArrastre = false;
      if (gizmoDrag?.ctrl === ctrl) {
        gizmoDrag = null;
        framesQuietos = 0; // se vuelve a anclar donde quedó
      }
      return;
    }
    alSeleccionar(ctrl);
  });
  // Grip: SOLO el mando derecho gira (15° por apretón). El mando izquierdo
  // no mueve ni gira nada — únicamente abre/cierra puertas con su gatillo.
  ctrl.addEventListener('squeezestart', () => {
    if (!renderer.xr.isPresenting || !muebleGroup) return;
    if (ctrl.userData.handedness !== 'right') return;
    girarMueble(-15);
    pulso(ctrl);
  });
  scene.add(ctrl);
  scene.add(grip);
  controlesXR.push(ctrl);
}

// Modo "llevar" (estilo Layout): el mueble flota agarrado al mando y sigue
// la mano con SUAVIZADO (sin tirones). Se "repele": nunca se acerca a ti más
// que su propio tamaño + 35 cm. Si el láser toca una superficie real más
// cerca, el mueble se apoya ahí (se desliza por piso y paredes, como Layout).
// La palanca de esa mano lo acerca/aleja. Otro clic de gatillo lo deja fijo.
const _objetivoLlevar = new THREE.Vector3();
function procesarLlevar(frame) {
  if (!llevando || !muebleGroup) return;
  const ray = rayoDe(llevando.ctrl).ray;

  // Distancia mínima de repulsión según el tamaño del mueble
  const W = dimsAct.ancho / 1000 * escalaMueble;
  const D = dimsAct.prof / 1000 * escalaMueble;
  const distMin = Math.hypot(W, D) / 2 + 0.35;
  let dist = Math.max(llevando.dist, distMin);

  // Tope contra la superficie real que toca el láser
  const hs = llevando.ctrl.userData.hitSource;
  if (hs && frame) {
    const hits = frame.getHitTestResults(hs);
    if (hits.length) {
      const p = hits[0].getPose(renderer.xr.getReferenceSpace());
      if (p) {
        const hp = p.transform.position;
        const dHit = Math.hypot(hp.x - ray.origin.x, hp.y - ray.origin.y, hp.z - ray.origin.z);
        if (dHit > 0.6 && dHit < dist) dist = Math.max(distMin, dHit);
      }
    }
  }

  _objetivoLlevar.copy(ray.origin).addScaledVector(ray.direction, dist);
  muebleGroup.position.lerp(_objetivoLlevar, 0.22); // seguimiento suave
  alturaLibre = true;

  // Giro suave para quedar SIEMPRE de frente al usuario (sin ladearse)
  const cam = renderer.xr.getCamera().position;
  const yawObj = Math.atan2(cam.x - muebleGroup.position.x, cam.z - muebleGroup.position.z);
  let dYaw = yawObj - muebleGroup.rotation.y;
  while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
  while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
  muebleGroup.rotation.y += dYaw * 0.2;

  marcarMovimiento();
  restringirPosicion();
}

function soltarMueble() {
  if (!llevando) return;
  llevando = null;
  if (!muebleGroup) return;
  if (muebleGroup.position.y - nivelPiso() <= 0.15) alturaLibre = false; // asienta
  pegarAPared(0.35);
  restringirPosicion();
  framesQuietos = 0;
}

// ---------- Varios muebles en la misma sala ----------
function intersecarMuebles(ctrl) {
  if (!muebles.length) return null;
  const hits = rayoDe(ctrl).intersectObjects(muebles.map(m => m.group), true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !muebles.some(m => m.group === obj)) obj = obj.parent;
  return muebles.find(m => m.group === obj) ?? null;
}

function guardarActivoEnLista() {
  if (!muebleGroup) return;
  muebles.push({
    group: muebleGroup,
    params: leerParametros(),
    material: materialActual,
    escala: escalaMueble,
    libre: alturaLibre,
  });
}

// Restaura inputs Y la configuración de módulos de un mueble guardado
// (sin esto, al cambiar de mueble se quedaban los módulos del anterior)
function restaurarParams(params) {
  for (const [k, v] of Object.entries(params)) if ($(k) && k !== 'modulos') $(k).value = v;
  modulosConfig = (params.modulos && params.modulos.length)
    ? params.modulos.map(mm => ({ ...moduloDefault(), ...mm }))
    : [moduloDefault()];
  $('divisiones').value = modulosConfig.length - 1;
  moduloSel = 0;
  sincronizarModulos();
}

// Hace activo un mueble ya colocado (el gizmo y el panel pasan a él)
function activarMueble(entrada) {
  marcarMovimiento();
  guardarActivoEnLista();
  muebles.splice(muebles.indexOf(entrada), 1);
  muebleGroup = entrada.group;
  restaurarParams(entrada.params);
  escalaMueble = entrada.escala;
  alturaLibre = entrada.libre;
  seleccionarMaterial(entrada.material); // reconstruye conservando su posición
  historial = [];
}

// El mueble actual queda fijo y aparece uno nuevo (mismo diseño) al frente
function agregarMueble() {
  if (!muebleGroup) return;
  marcarMovimiento();
  guardarActivoEnLista();
  muebleGroup = null;
  piezasInfo = [];
  animPuertas = [];
  reconstruir();
  if (renderer.xr.isPresenting) traerAlFrente();
  historial = [];
}

function quitarMueble() {
  if (!muebleGroup) return;
  marcarMovimiento();
  muebleGroup.traverse(o => o.geometry?.dispose());
  scene.remove(muebleGroup);
  muebleGroup = null;
  const previo = muebles.pop();
  if (previo) {
    muebleGroup = previo.group;
    restaurarParams(previo.params);
    escalaMueble = previo.escala;
    alturaLibre = previo.libre;
    seleccionarMaterial(previo.material);
  } else {
    reconstruir(); // siempre queda al menos un mueble
    if (renderer.xr.isPresenting) traerAlFrente();
  }
  historial = [];
}

renderer.xr.addEventListener('sessionstart', async () => {
  entornoPC.visible = false;
  scene.background = null;
  panelXR.visible = true;
  crucetaXR.visible = true;
  mallaGroup.visible = mallaVisible;
  controlesXR.forEach(c => c.visible = true);
  // Que NO nazca encima del usuario: 1,5 m al frente, mirando hacia ti
  if (muebleGroup) {
    muebleGroup.position.set(0, 0, -1.5);
    muebleGroup.rotation.set(0, 0, 0);
  }
  framesQuietos = 0;
  const session = renderer.xr.getSession();
  const refSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: refSpace });
});

renderer.xr.addEventListener('sessionend', () => {
  entornoPC.visible = true;
  scene.background = new THREE.Color(0x1a1714);
  reticula.visible = false;
  panelXR.visible = false;
  crucetaXR.visible = false;
  menuXR.visible = false;
  menuObjetoXR.visible = false;
  mallaGroup.visible = false;
  gizmo.visible = false;
  controlesXR.forEach(c => c.visible = false);
  hitTestSource = null;
  paredes = [];
  pisoPlanos = null;
  techoPlanos = null;
  techoParedes = null;
  reticleMinY = null;
  historial = [];
  llevando = null;
  gizmoDrag = null;
  selectorXR.visible = false;
  biblioXR.visible = false;
  alturaLibre = false;
  ayudaXR.visible = false;
  despieceXR.visible = false;
  liberarAncla();
  framesQuietos = 0;
  if (modoPuntos) alternarCuatroPuntos(); // cancela la medición pendiente
  marcadoresPuntos.clear();
  puntosMedidos.length = 0;
  paredMarcada = null;
  modoMarcarPared = false;
  actualizarBtnPared();
  vizParedMesh.visible = vizParedBorde.visible = false;
  controlesXR.forEach(c => { c.userData.hitSource = null; c.userData.fueArrastre = false; });
  limpiarMallas();
  fijarEscala(1);
  muebleGroup.position.set(0, 0, 0);
  muebleGroup.rotation.set(0, 0, 0);
});

// ---------- Joysticks ----------
// Izquierdo: mover por el piso. Derecho: X rota, Y sube/baja. A/B: menú.
const _vDir = new THREE.Vector3();
const _vLat = new THREE.Vector3();
let aBtnPrev = false;
let bBtnPrev = false;
let xyBtnPrev = false;

function procesarJoysticks() {
  const session = renderer.xr.getSession();
  if (!session || !muebleGroup) return;
  const cam = renderer.xr.getCamera().position;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    if (src.handedness === 'right') {
      // A (botón 4) = menú general · B (botón 5) = opciones de ESTE mueble
      const a = !!gp.buttons?.[4]?.pressed;
      const b = !!gp.buttons?.[5]?.pressed;
      if (a && !aBtnPrev) alternarMenu();
      if (b && !bBtnPrev) abrirMenuObjeto();
      aBtnPrev = a;
      bBtnPrev = b;
    }
    // Mando izquierdo: X = abrir/cerrar puertas, Y = deshacer
    if (src.handedness === 'left') {
      const presionadoXY = !!(gp.buttons?.[4]?.pressed || gp.buttons?.[5]?.pressed);
      if (presionadoXY && !xyBtnPrev) {
        if (gp.buttons?.[4]?.pressed) alternarPuertas();
        else deshacer();
      }
      xyBtnPrev = presionadoXY;
    }
    // Llevando el mueble: la palanca de esa mano lo acerca / aleja
    if (llevando && src.handedness === llevando.mano) {
      const ejesL = gp.axes;
      if (ejesL && ejesL.length >= 4 && Math.abs(ejesL[3]) >= 0.2) {
        llevando.dist = Math.min(6, Math.max(0.35, llevando.dist - ejesL[3] * 0.03));
      }
      continue;
    }
    const ejes = gp.axes;
    if (!ejes || ejes.length < 4) continue;
    const x = ejes[2], y = ejes[3];
    if (Math.abs(x) < 0.2 && Math.abs(y) < 0.2) continue;
    if (src.handedness === 'right') {
      // Una sola función a la vez para que no se crucen los movimientos:
      // "Rotar: Sí" en el panel → rota; "Rotar: No" → sube/baja.
      marcarMovimiento();
      if (modoRotar) {
        if (Math.abs(x) >= 0.2) muebleGroup.rotation.y -= x * 0.02;
      } else if (Math.abs(y) >= 0.2) {
        alturaLibre = true;
        muebleGroup.position.y -= y * 0.008;
        if (muebleGroup.position.y <= nivelPiso() + 0.02) alturaLibre = false; // llegó al piso
      }
      restringirPosicion();
    } else {
      if (!moverActivo) continue; // palanca izquierda desactivada con "Mover: No"
      // Desplazamiento sobre el piso según hacia dónde MIRAS:
      // palanca adelante = se aleja, atrás = se acerca, lados = izquierda/derecha
      marcarMovimiento();
      _vDir.set(0, 0, -1).applyQuaternion(renderer.xr.getCamera().quaternion);
      _vDir.y = 0;
      if (_vDir.lengthSq() < 1e-6) _vDir.set(0, 0, -1); else _vDir.normalize();
      _vLat.set(-_vDir.z, 0, _vDir.x); // derecha de tu vista
      muebleGroup.position.addScaledVector(_vDir, -y * 0.012);
      muebleGroup.position.addScaledVector(_vLat, x * 0.012);
      restringirPosicion();
    }
  }
}

// Un error en una función XR no debe congelar toda la app: se atrapa, se
// registra y se muestra en la barra del panel para diagnosticarlo en el visor.
let ultimoError = '';
function seguro(nombre, fn) {
  try { fn(); } catch (e) {
    if (ultimoError !== `${nombre}:${e.message}`) {
      ultimoError = `${nombre}:${e.message}`;
      console.error(`[XR ${nombre}]`, e);
      try { infoTex.dibujar(`⚠ ${nombre}: ${String(e.message).slice(0, 38)}`); } catch { /* sin panel */ }
    }
  }
}

// ============================== Bucle de render ==============================
renderer.setAnimationLoop((_, frame) => {
  controls.update();

  // Animación de puertas y cajones, cada uno con su propio estado
  let animCambio = false;
  for (const e of [...animPuertas, ...cajonesEstados]) {
    if (Math.abs(e.f - e.objetivo) > 0.001) {
      e.f = Math.max(0, Math.min(1, e.f + Math.sign(e.objetivo - e.f) * 0.05));
      animCambio = true;
    }
  }
  if (animCambio) aplicarPuertas();

  if (frame) {
    // Retícula: sigue el rayo del mando derecho; si no hay, la mirada
    seguro('reticula', () => {
      const ctrlDer = controlesXR.find(c => c.userData.handedness === 'right' && c.userData.hitSource);
      const fuente = ctrlDer?.userData.hitSource ?? hitTestSource;
      if (!fuente) return;
      const hits = frame.getHitTestResults(fuente);
      let valida = false;
      if (hits.length) {
        const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
        if (pose) {
          // Ignorar impactos pegados a la mano (malla de objetos junto a ti)
          const hp = pose.transform.position;
          const origen = ctrlDer
            ? _vTmp.setFromMatrixPosition(ctrlDer.matrixWorld)
            : renderer.xr.getCamera().position;
          const dx = hp.x - origen.x, dy = hp.y - origen.y, dz = hp.z - origen.z;
          if (dx * dx + dy * dy + dz * dz > 0.36) {
            valida = true;
            reticula.visible = !llevando; // llevándolo, el mueble es el indicador
            reticula.matrix.fromArray(pose.transform.matrix);
            // El punto más bajo apuntado sirve de respaldo para ubicar el piso
            if (reticleMinY === null || hp.y < reticleMinY) reticleMinY = hp.y;
          }
        }
      }
      if (!valida && ctrlDer) {
        // Zona mal escaneada: respaldo con el cruce del láser y el piso real.
        // Así puedes apuntar lejos aunque la malla tenga huecos.
        const ray = rayoDe(ctrlDer).ray;
        if (ray.direction.y < -0.03) {
          const piso = nivelPiso();
          const t = (piso - ray.origin.y) / ray.direction.y;
          if (t > 0.4 && t < 15) {
            _vTmp.copy(ray.origin).addScaledVector(ray.direction, t);
            reticula.matrix.makeTranslation(_vTmp.x, piso, _vTmp.z);
            reticula.visible = !llevando;
            valida = true;
          }
        }
      }
      if (!valida) reticula.visible = false;
    });
    seguro('paredes', () => actualizarParedes(frame));
    seguro('malla', () => actualizarMallas(frame));
    seguro('paredViz', () => actualizarParedMarcada(frame));
    seguro('joysticks', procesarJoysticks);
    seguro('llevar', () => procesarLlevar(frame));
    seguro('gizmoDrag', procesarGizmo);
    seguro('ancla', () => procesarAncla(frame));
    seguro('gizmo', actualizarGizmo);
    // Resaltar la manija del gizmo apuntada
    seguro('gizmoHover', () => {
      let mango = null;
      if (!gizmoDrag && !llevando) {
        for (const c of controlesXR) if (c.visible) mango = intersecarGizmo(c) || mango;
      }
      for (const m of gizmoMangos) {
        const activo = gizmoDrag ? (m.userData.tipo === gizmoDrag.tipo) : (m === mango);
        for (const v of m.userData.visuales) {
          v.material.color.setHex(activo ? 0xffffff : v.userData.colorBase);
        }
      }
    });
    // Resaltar el botón apuntado y el chip activo
    seguro('botones', () => {
      let apuntado = null;
      for (const c of controlesXR) if (c.visible) apuntado = intersecarBoton(c) || apuntado;
      for (const b of [...botonesXR, ...botonesMenu, ...botonesSelector, ...botonesCruceta, ...botonesObjeto, ...botonesBiblio]) {
        b.material.color.setHex(b === apuntado ? 0xffc46b : (b.userData.activo ? 0xe8a33d : 0xffffff));
      }
    });
  }
  renderer.render(scene, camera);
});

// Primera construcción
reconstruir();
