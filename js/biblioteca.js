// Biblioteca Florenza V — 50 diseños basados en medidas estándar de
// carpintería profesional (módulos de cocina 300-900 mm, prof. 600 bajo /
// 350 aéreo, clósets prof. 600 con barra a ~1700-1900, estantes cada
// 280-350 mm, cajones ~160-200 mm, escritorios 750 alto, mesas 750 alto).
// Cada plantilla usa el mismo formato que un proyecto guardado: al cargarla
// se puede MODIFICAR todo (quitar laterales, mover entrepaños, etc.).

// Módulo con valores por defecto (vacío) + lo que se indique
const m = (extra = {}) => ({
  ancho: 0, alto: 0, entrepanos: 0, alturasEnt: [], subdiv: 0, anchosSub: [],
  puertas: 0, cajones: 0, tubo: 0, ...extra,
});

// Plantilla compacta
const p = (cat, nombre, material, params) => ({
  cat, nombre, material,
  params: { espesor: 18, zocalo: 100, apertura: 'lateral', divisiones: (params.modulos?.length ?? 1) - 1, ...params },
});

export const PLANTILLAS = [
  // ============ COCINAS INTEGRALES (bajo: alto 900, prof 600, zócalo 100) ============
  p('Cocinas integrales', 'Cocina lineal 1.80 m', 'blanca', {
    tipo: 'bajo', ancho: 1800, alto: 900, prof: 600,
    modulos: [m({ ancho: 600, cajones: 3 }), m({ puertas: 2, entrepanos: 1 }), m({ puertas: 1, entrepanos: 1 })],
  }),
  p('Cocinas integrales', 'Cocina lineal 2.40 m', 'blanca', {
    tipo: 'bajo', ancho: 2400, alto: 900, prof: 600,
    modulos: [m({ ancho: 450, cajones: 4 }), m({ puertas: 2, entrepanos: 1 }), m({ ancho: 600, puertas: 2 }), m({ puertas: 1, entrepanos: 1 })],
  }),
  p('Cocinas integrales', 'Cocina lineal 3.00 m', 'gris', {
    tipo: 'bajo', ancho: 3000, alto: 900, prof: 600,
    modulos: [m({ ancho: 600, cajones: 3 }), m({ ancho: 900, puertas: 2, entrepanos: 1 }), m({ ancho: 600, puertas: 2, entrepanos: 1 }), m({ puertas: 1, entrepanos: 1 })],
  }),
  p('Cocinas integrales', 'Módulo lavaplatos 1.20 m', 'blanca', {
    tipo: 'bajo', ancho: 1200, alto: 900, prof: 600,
    modulos: [m({ puertas: 2 })],
  }),
  p('Cocinas integrales', 'Cajonera de cocina 60 cm', 'blanca', {
    tipo: 'bajo', ancho: 600, alto: 900, prof: 600,
    modulos: [m({ cajones: 4 })],
  }),
  p('Cocinas integrales', 'Módulo esquinero 90 cm', 'blanca', {
    tipo: 'bajo', ancho: 900, alto: 900, prof: 600,
    modulos: [m({ puertas: 1, entrepanos: 1 })],
  }),
  p('Cocinas integrales', 'Alacena aérea 1.80 m', 'blanca', {
    tipo: 'alacena', ancho: 1800, alto: 700, prof: 350, zocalo: 0,
    modulos: [m({ puertas: 2, entrepanos: 1 }), m({ puertas: 2, entrepanos: 1 }), m({ puertas: 1, entrepanos: 1 })],
  }),
  p('Cocinas integrales', 'Alacena aérea 2.40 m', 'gris', {
    tipo: 'alacena', ancho: 2400, alto: 700, prof: 350, zocalo: 0,
    modulos: [m({ puertas: 2, entrepanos: 1 }), m({ puertas: 2, entrepanos: 1 }), m({ puertas: 2, entrepanos: 1 }), m({ puertas: 2, entrepanos: 1 })],
  }),
  p('Cocinas integrales', 'Torre de horno 60 cm', 'blanca', {
    tipo: 'closet', ancho: 600, alto: 2200, prof: 600, zocalo: 100,
    modulos: [m({ entrepanos: 3, alturasEnt: [600, 1150, 1750], puertas: 1 })],
  }),
  p('Cocinas integrales', 'Despensa 80 cm', 'blanca', {
    tipo: 'closet', ancho: 800, alto: 2200, prof: 600, zocalo: 100,
    modulos: [m({ entrepanos: 5, puertas: 2 })],
  }),

  // ============ CLÓSETS (prof 600, alto 2300, barra a ~1750) ============
  p('Clósets', 'Clóset 1.50 m básico', 'roble', {
    tipo: 'closet', ancho: 1500, alto: 2300, prof: 600, zocalo: 80,
    modulos: [m({ ancho: 900, tubo: 1, entrepanos: 1, alturasEnt: [1850] }), m({ entrepanos: 5 })],
  }),
  p('Clósets', 'Clóset 1.80 m con cajonera', 'roble', {
    tipo: 'closet', ancho: 1800, alto: 2300, prof: 600, zocalo: 80,
    modulos: [m({ ancho: 1000, tubo: 1, entrepanos: 1, alturasEnt: [1850] }), m({ cajones: 4 }), m({ entrepanos: 5 })],
  }),
  p('Clósets', 'Clóset 2.00 m doble barra', 'cedro', {
    tipo: 'closet', ancho: 2000, alto: 2300, prof: 600, zocalo: 80,
    modulos: [m({ ancho: 1000, tubo: 1, entrepanos: 1, alturasEnt: [1100] }), m({ tubo: 1, entrepanos: 2, alturasEnt: [1100, 1900] })],
  }),
  p('Clósets', 'Clóset 2.40 m familiar', 'roble', {
    tipo: 'closet', ancho: 2400, alto: 2300, prof: 600, zocalo: 80,
    modulos: [m({ ancho: 1000, tubo: 1, entrepanos: 1, alturasEnt: [1850] }), m({ ancho: 600, cajones: 5 }), m({ entrepanos: 6 })],
  }),
  p('Clósets', 'Clóset 2.80 m con maletero', 'wengue', {
    tipo: 'closet', ancho: 2800, alto: 2400, prof: 600, zocalo: 80,
    modulos: [m({ ancho: 1000, tubo: 1, entrepanos: 1, alturasEnt: [1900] }), m({ ancho: 800, tubo: 1, entrepanos: 2, alturasEnt: [1150, 1900] }), m({ cajones: 4 })],
  }),
  p('Clósets', 'Vestier abierto 2.00 m', 'roble', {
    tipo: 'closet', ancho: 2000, alto: 2300, prof: 500, zocalo: 80,
    modulos: [m({ tubo: 1, entrepanos: 1, alturasEnt: [1850] }), m({ entrepanos: 4, subdiv: 1 })],
  }),
  p('Clósets', 'Zapatera de clóset 80 cm', 'roble', {
    tipo: 'closet', ancho: 800, alto: 1200, prof: 350, zocalo: 60,
    modulos: [m({ entrepanos: 5 })],
  }),
  p('Clósets', 'Clóset infantil 1.20 m', 'blanca', {
    tipo: 'closet', ancho: 1200, alto: 1800, prof: 550, zocalo: 80,
    modulos: [m({ tubo: 1, entrepanos: 1, alturasEnt: [1400] }), m({ entrepanos: 3, cajones: 0 })],
  }),
  p('Clósets', 'Cómoda de alcoba 90 cm', 'cedro', {
    tipo: 'comoda', ancho: 900, alto: 900, prof: 500, zocalo: 80, cajones: 4,
    modulos: [m({ cajones: 4 })],
  }),
  p('Clósets', 'Nochero 45 cm', 'cedro', {
    tipo: 'comoda', ancho: 450, alto: 550, prof: 400, zocalo: 60, cajones: 2,
    modulos: [m({ cajones: 2 })],
  }),

  // ============ LICORERAS Y BUFFETS ============
  p('Licoreras y buffets', 'Licorera con cava 1.00 m', 'wengue', {
    tipo: 'closet', ancho: 1000, alto: 1900, prof: 400, zocalo: 80,
    modulos: [m({ entrepanos: 3, alturasEnt: [500, 950, 1400], subdiv: 3 })],
  }),
  p('Licoreras y buffets', 'Licorera 1.20 m puertas abajo', 'wengue', {
    tipo: 'closet', ancho: 1200, alto: 1900, prof: 420, zocalo: 80,
    modulos: [m({ entrepanos: 3, alturasEnt: [700, 1150, 1550], subdiv: 2, puertas: 2 })],
  }),
  p('Licoreras y buffets', 'Cava de vinos 80 cm', 'cedro', {
    tipo: 'closet', ancho: 800, alto: 1500, prof: 350, zocalo: 60,
    modulos: [m({ entrepanos: 4, subdiv: 4 })],
  }),
  p('Licoreras y buffets', 'Buffet 1.60 m', 'roble', {
    tipo: 'bajo', ancho: 1600, alto: 850, prof: 450,
    modulos: [m({ puertas: 2, entrepanos: 1 }), m({ cajones: 3 }), m({ puertas: 1, entrepanos: 1 })],
  }),
  p('Licoreras y buffets', 'Buffet 1.80 m con licorera', 'wengue', {
    tipo: 'bajo', ancho: 1800, alto: 850, prof: 450,
    modulos: [m({ puertas: 2, entrepanos: 1 }), m({ subdiv: 3, entrepanos: 1 }), m({ cajones: 3 })],
  }),
  p('Licoreras y buffets', 'Aparador 2.00 m', 'roble', {
    tipo: 'bajo', ancho: 2000, alto: 900, prof: 450,
    modulos: [m({ puertas: 2, entrepanos: 1 }), m({ cajones: 4 }), m({ puertas: 2, entrepanos: 1 })],
  }),
  p('Licoreras y buffets', 'Vitrina 90 cm', 'cedro', {
    tipo: 'closet', ancho: 900, alto: 1800, prof: 400, zocalo: 80,
    modulos: [m({ entrepanos: 4, puertas: 2 })],
  }),
  p('Licoreras y buffets', 'Bar esquinero 70 cm', 'wengue', {
    tipo: 'closet', ancho: 700, alto: 1100, prof: 400, zocalo: 60,
    modulos: [m({ entrepanos: 2, subdiv: 2 })],
  }),
  p('Licoreras y buffets', 'Mueble TV 1.80 m', 'gris', {
    tipo: 'bajo', ancho: 1800, alto: 500, prof: 400, zocalo: 60,
    modulos: [m({ cajones: 2 }), m({ entrepanos: 1 }), m({ puertas: 2 })],
  }),
  p('Licoreras y buffets', 'Mueble TV 2.40 m flotante', 'wengue', {
    tipo: 'bajo', ancho: 2400, alto: 450, prof: 380, zocalo: 0,
    modulos: [m({ cajones: 2 }), m({ entrepanos: 1 }), m({ cajones: 2 }), m({ entrepanos: 1 })],
  }),

  // ============ ESCRITORIOS (alto 750, prof 600) ============
  p('Escritorios', 'Escritorio 1.20 m con cajonera', 'roble', {
    tipo: 'bajo', ancho: 1200, alto: 750, prof: 600, zocalo: 60,
    modulos: [m({ ancho: 400, cajones: 3 }), m()],
  }),
  p('Escritorios', 'Escritorio 1.50 m doble cajonera', 'roble', {
    tipo: 'bajo', ancho: 1500, alto: 750, prof: 600, zocalo: 60,
    modulos: [m({ ancho: 400, cajones: 3 }), m(), m({ ancho: 400, cajones: 3 })],
  }),
  p('Escritorios', 'Escritorio gerencial 1.80 m', 'wengue', {
    tipo: 'bajo', ancho: 1800, alto: 750, prof: 700, zocalo: 60,
    modulos: [m({ ancho: 450, cajones: 3 }), m(), m({ ancho: 450, puertas: 1, entrepanos: 1 })],
  }),
  p('Escritorios', 'Escritorio compacto 1.00 m', 'blanca', {
    tipo: 'bajo', ancho: 1000, alto: 750, prof: 500, zocalo: 60,
    modulos: [m({ ancho: 350, cajones: 2 }), m()],
  }),
  p('Escritorios', 'Biblioteca 90 cm × 2.00 m', 'roble', {
    tipo: 'closet', ancho: 900, alto: 2000, prof: 300, zocalo: 60,
    modulos: [m({ entrepanos: 4 })],
  }),
  p('Escritorios', 'Biblioteca 1.20 m con puertas', 'cedro', {
    tipo: 'closet', ancho: 1200, alto: 2000, prof: 320, zocalo: 60,
    modulos: [m({ entrepanos: 4 }), m({ entrepanos: 2, alturasEnt: [620, 1240], puertas: 1 })],
  }),
  p('Escritorios', 'Archivador 50 cm', 'gris', {
    tipo: 'comoda', ancho: 500, alto: 750, prof: 600, zocalo: 60, cajones: 3,
    modulos: [m({ cajones: 3 })],
  }),
  p('Escritorios', 'Mesa de estudio 1.20 m', 'blanca', {
    tipo: 'mesa', ancho: 1200, alto: 750, prof: 600, zocalo: 0,
    modulos: [m()],
  }),
  p('Escritorios', 'Repisa cubo 35 cm', 'roble', {
    tipo: 'alacena', ancho: 350, alto: 350, prof: 300, zocalo: 0,
    modulos: [m()],
  }),
  p('Escritorios', 'Organizador oficina 1.60 m', 'gris', {
    tipo: 'bajo', ancho: 1600, alto: 750, prof: 450, zocalo: 60,
    modulos: [m({ cajones: 3 }), m({ entrepanos: 1 }), m({ puertas: 2, entrepanos: 1 })],
  }),

  // ============ MESAS Y COMPLEMENTOS (comedor alto 750) ============
  p('Mesas y complementos', 'Mesa comedor 4 puestos', 'roble', {
    tipo: 'mesa', ancho: 1200, alto: 750, prof: 800, zocalo: 0, modulos: [m()],
  }),
  p('Mesas y complementos', 'Mesa comedor 6 puestos', 'cedro', {
    tipo: 'mesa', ancho: 1600, alto: 750, prof: 900, zocalo: 0, modulos: [m()],
  }),
  p('Mesas y complementos', 'Mesa comedor 8 puestos', 'wengue', {
    tipo: 'mesa', ancho: 2000, alto: 750, prof: 1000, zocalo: 0, modulos: [m()],
  }),
  p('Mesas y complementos', 'Mesa de centro', 'roble', {
    tipo: 'mesa', ancho: 900, alto: 450, prof: 500, zocalo: 0, modulos: [m()],
  }),
  p('Mesas y complementos', 'Mesa auxiliar', 'cedro', {
    tipo: 'mesa', ancho: 500, alto: 550, prof: 500, zocalo: 0, modulos: [m()],
  }),
  p('Mesas y complementos', 'Barra desayunador 1.50 m', 'wengue', {
    tipo: 'mesa', ancho: 1500, alto: 900, prof: 400, zocalo: 0, modulos: [m()],
  }),
  p('Mesas y complementos', 'Banca de comedor 1.40 m', 'roble', {
    tipo: 'mesa', ancho: 1400, alto: 450, prof: 350, zocalo: 0, modulos: [m()],
  }),
  p('Mesas y complementos', 'Zapatero de entrada 90 cm', 'gris', {
    tipo: 'bajo', ancho: 900, alto: 1100, prof: 320, zocalo: 60,
    modulos: [m({ entrepanos: 3, puertas: 2 })],
  }),
  p('Mesas y complementos', 'Botinero con cajón 1.00 m', 'roble', {
    tipo: 'bajo', ancho: 1000, alto: 500, prof: 380, zocalo: 60,
    modulos: [m({ cajones: 1, entrepanos: 0 }), m({ entrepanos: 1 })],
  }),
  p('Mesas y complementos', 'Centro de entretenimiento 3.00 m', 'wengue', {
    tipo: 'closet', ancho: 3000, alto: 2200, prof: 400, zocalo: 80,
    modulos: [m({ ancho: 500, entrepanos: 4 }), m({ ancho: 1400, entrepanos: 1, alturasEnt: [600] }), m({ ancho: 500, entrepanos: 4 }), m({ cajones: 3 })],
  }),
];
