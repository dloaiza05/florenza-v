# 🪚 Florenza V

Diseñador paramétrico de muebles de madera con **realidad mixta para Meta Quest 3 / 3S**.
100 % gratis: sin Unity, sin cuenta de desarrollador, sin tiendas, sin nube. Es una
aplicación web (WebXR + Three.js) que corre en el navegador del PC y en el navegador
del Quest.

## Qué hace

- **Diseño paramétrico**: eliges tipo de mueble (bajo de cocina, alacena, clóset,
  cómoda, mesa) y digitas medidas, espesor de lámina, entrepaños, puertas y cajones.
  El mueble se genera al instante en 3D.
- **Despiece automático**: tabla con cada pieza (laterales, base, tapa, entrepaños,
  puertas, cajones…), cantidades, medidas de corte y orientación de la veta.
- **Plano de corte optimizado**: distribuye las piezas en láminas (2440×1220 por
  defecto, configurable), respeta la veta, descuenta el kerf de la sierra y calcula
  láminas necesarias, % de aprovechamiento y costo.
- **Vista explosionada / animación de armado**: para mostrar al cliente cómo se
  ensambla el mueble pieza por pieza.
- **Materiales**: roble, cedro, wengué, melamina blanca/gris, MDF — texturas
  procedurales con veta orientada correctamente por pieza.
- **Importar GLB**: trae modelos hechos en Blender, 3ds Max, SketchUp, etc.
  (exportados como `.glb`).
- **Guardar proyectos**: en el equipo (localStorage) o exportar/importar JSON.
- **Realidad mixta en Quest 3/3S**: botón "START AR" → passthrough; apunta al piso
  real y con el gatillo colocas el mueble a escala real en tu espacio.

## Cómo ejecutarlo en el PC

Necesitas servir los archivos por HTTP (no abrir el index con doble clic).
Cualquiera de estas opciones, dentro de la carpeta `mueble-xr`:

```powershell
# Si tienes Python:
python -m http.server 8080

# Si tienes Node.js:
npx serve .
```

Luego abre `http://localhost:8080` en el navegador.

## Cómo verlo en el Meta Quest 3 / 3S

### Opción A — Un clic (recomendada para empezar)

Haz doble clic en **`INICIAR-PARA-QUEST.bat`**. Arranca el servidor y un túnel
HTTPS gratuito de Cloudflare (sin cuenta). En la ventana aparece una URL tipo
`https://algo.trycloudflare.com` — ábrela en el navegador del Quest, pulsa
**START AR**, apunta al piso y aprieta el gatillo para colocar el mueble.
La URL cambia en cada ejecución y el PC debe quedar encendido mientras la usas.

### Opción B — URL fija y permanente (GitHub Pages)

WebXR exige HTTPS, así que la forma gratis de tener una URL fija es publicarlo:

1. Crea una cuenta gratuita en [GitHub](https://github.com).
2. Crea un repositorio (por ejemplo `mueble-xr`) y sube esta carpeta.
3. En el repositorio: **Settings → Pages → Source: main branch** → Save.
4. En unos minutos tendrás una URL tipo `https://tuusuario.github.io/mueble-xr/`.
5. Abre esa URL en el **navegador del Quest**, pulsa **START AR**, apunta al piso
   y aprieta el gatillo para colocar el mueble en tu espacio real.

Alternativa sin publicar: con el Quest en modo desarrollador y `adb reverse
tcp:8080 tcp:8080` puedes abrir `http://localhost:8080` dentro del visor.

## Estructura

```
mueble-xr/
├── index.html        Interfaz (panel de parámetros, viewport 3D, despiece, plano)
├── css/style.css     Tema visual
└── js/
    ├── app.js        Escena 3D, AR, proyectos, importación GLB
    ├── furniture.js  Generador paramétrico de piezas
    ├── cutlist.js    Despiece y optimización de corte
    └── materials.js  Texturas de madera procedurales
```

## Notas

- Las medidas internas están en milímetros; el "largo" de cada pieza corre con la veta.
- La trasera y los fondos de cajón se asumen en 3 mm y no entran al plano de la
  lámina principal (van marcados con `*` en el despiece).
- Requiere internet la primera vez (Three.js se carga desde CDN).
