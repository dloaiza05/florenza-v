# 🪚 Florenza V — Guía completa

Diseñador paramétrico de muebles de madera con realidad mixta para Meta Quest 3 / 3S.
100 % gratis, sin Unity, sin cuenta de desarrollador, sin nube de pago.
Es una app web (WebXR + Three.js) que corre en el navegador del PC y del Quest.

---

## ✅ CÓMO ACTIVAR EL TÚNEL (para usar en el Quest)

### La forma fácil (recomendada)
1. **Doble clic en el acceso directo del escritorio: "Florenza V - Iniciar"**
   (o busca "Florenza V" en el menú Inicio de Windows).
2. Se abre una ventana negra. Espera ~15 segundos.
3. Aparece el **código QR en la pantalla** y la URL.
4. Ponte el Quest, mira el QR con el passthrough y toca la notificación.
5. **Deja esa ventana negra abierta** mientras uses las gafas.

### Por qué se cae el link
La URL gratuita de Cloudflare (`xxxxx.trycloudflare.com`) **cambia cada vez** que
reinicias y se cae si cierras la ventana o apagas el PC. Es normal en la versión
gratis. Cada vez que abras el acceso directo, genera una URL nueva y abre el QR.

### El comando manual (si el acceso directo falla)
Abre PowerShell en la carpeta `mueble-xr` y ejecuta:
```powershell
# 1) Servidor local
Start-Process cmd -ArgumentList '/c npx -y serve . -l 8123' -WindowStyle Hidden
# 2) Túnel (muestra la URL en pantalla)
herramientas\cloudflared.exe tunnel --url http://localhost:8123
```
La URL aparece en el recuadro que dice "Your quick Tunnel has been created".

### Solución definitiva (URL fija para siempre)
Publicar en **GitHub Pages** (gratis): tendrías una dirección permanente que
nunca se cae ni cambia, sin depender de que el PC esté encendido. Requiere crear
una cuenta gratis en github.com. Pídemelo y te guío en 10 minutos.

---

## 📁 ESTRUCTURA DEL PROYECTO (todo en una sola ruta)

Todo vive en: `C:\Users\Asus\Downloads\n8n\mueble-xr\`

```
mueble-xr/
├── index.html              Interfaz principal (carga js/app.js?v=N)
├── qr.html                 Página del código QR
├── INICIAR-PARA-QUEST.bat  Lanzador (servidor + túnel + QR)
├── GUIA-FLORENZA-V.md      Esta guía
├── css/style.css           Estilos
├── js/
│   ├── app.js              Lógica: UI, escena 3D, AR, módulos, despiece
│   ├── furniture.js        Generador paramétrico de piezas (la geometría)
│   ├── cutlist.js          Despiece y optimización de corte de láminas
│   └── materials.js        Texturas de madera procedurales
└── herramientas/
    ├── cloudflared.exe     Programa del túnel
    ├── tunel.log           Log del túnel (se regenera)
    └── url.txt             Última URL generada (la lee qr.html)
```

---

## 🔄 CÓMO ACTUALIZAR EN EL FUTURO

1. Edita los archivos en `js/` (la geometría está en `furniture.js`,
   la interfaz y el despiece en `app.js`).
2. **MUY IMPORTANTE:** sube el número de versión en `index.html`, línea final:
   `<script type="module" src="js/app.js?v=39"></script>`  → cambia `v=39` a `v=40`.
   Esto obliga al navegador a cargar la versión nueva (evita caché vieja).
3. Si el servidor ya está corriendo, solo recarga la página en el Quest/PC.
4. Versión actual: **v39**.

---

## 🎛️ CÓMO FUNCIONA EL MUEBLE (modelo de módulos)

- **Divisiones** = número de laterales internos. Módulos = divisiones + 1.
- Los **módulos nacen VACÍOS** (sin puertas, cajones ni entrepaños).
- Cada módulo se identifica con una **letra (A, B, C…)** visible en el 3D y en
  el selector "Editar módulo".
- Cada módulo es **independiente**: su propio ancho, alto, entrepaños (con altura
  individual en mm), subdivisiones, puertas, cajones y tubo colgador.
- Las piezas en el despiece se distinguen una por una:
  - `Lateral interno 1, 2, 3` — divisiones entre módulos.
  - `Entrepaño A1, A2` — repisas de cada módulo.
  - `División int. A1, A2…` — subdivisiones (columnas tipo cava) de cada módulo.
- **Despiece separado**: ESTRUCTURA (carcasa) y ACCESORIOS (puertas, cajones,
  entrepaños, tubo). Todo se recalcula en mm con cada cambio, con áreas, canto,
  kerf de la sierra y optimización de corte de láminas.

---

## 🎮 CONTROLES EN EL QUEST (realidad mixta)

| Control | Función |
|---|---|
| Gatillo (clic) en piso/pared | Colocar el mueble donde apuntas |
| Gatillo (clic) en el mueble | Lo agarras; otro clic lo fija |
| Palanca (llevándolo) | Acercar / alejar |
| Gatillo en flechas / centro del gizmo | Mover por eje o deslizar |
| Grip derecho | Girar 15° |
| Mando IZQUIERDO (gatillo) | Solo abre / cierra puertas y cajones |
| Botón A (derecho) | Menú general |
| Botón B (derecho) | Opciones de ESTE mueble |
| Cruceta (panel) | Correr el mueble por la pared |
| 🎯 Marcar pared (menú) | El mueble solo se pega a esa pared |
| 📐 4 puntos (menú) | Medir un hueco y encajar el mueble |

---

## ⏳ PENDIENTE (lo que sigue si quieres)

1. **Control individual de cada subdivisión y lateral interno** (mover/medir cada
   uno por separado en mm, no en bloque) — como ya se hizo con las alturas de
   entrepaños.
2. **Submenú en AR** "Agregar puerta/cajón en módulo A / B…" con las letras.
3. **Precio de venta con margen** (30 / 40 / 50 %) para cotizar.
4. **Exportar despiece a PDF / Excel** para el taller.
5. **Publicar en GitHub Pages** (URL fija permanente).
