# SmartWardrobe — PMV

Gestor inteligente de armario y asistente personal de estilo. Aplicación web **estática**,
responsive e instalable como PWA. No tiene backend: los datos de cada persona se guardan
en su propio navegador (IndexedDB). Se publica gratis en GitHub Pages o en Cloudflare Pages.

| Documento | Contenido |
|---|---|
| [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md) | Manual de usuario (para ti y tus amigas) |
| [docs/ALGORITMO.md](docs/ALGORITMO.md) | Motor de recomendación: etapas, fórmulas, parámetros y cómo extenderlo |
| [docs/BACKUP.md](docs/BACKUP.md) | Copias de seguridad y restauración |
| [docs/LIMITACIONES.md](docs/LIMITACIONES.md) | Desviaciones del prompt maestro, riesgos, limitaciones y mejoras futuras |

---

## 1. Arquitectura y decisiones

```
 Navegador (celular o computador)                         Internet
┌──────────────────────────────────────────────────┐
│ UI React + TypeScript + Tailwind  (src/ui)       │
│   pantallas · componentes · enrutador por hash   │
├──────────────────────────────────────────────────┤
│ Dominio (TypeScript puro, sin DOM)  (src/domain) │      ┌──────────────────┐
│   recommender/ · status · planning · stats ·     │─────▶│ Open-Meteo API   │
│   colors · weather (cliente + caché + manual)    │ HTTPS│ (pronóstico,     │
├──────────────────────────────────────────────────┤      │  geocodificación)│
│ Persistencia (src/data)                          │      └──────────────────┘
│   db (IndexedDB + migraciones) · repo (aislamiento│
│   por perfil, transacciones) · images · backup   │
└──────────────────────────────────────────────────┘
  Service worker (public/sw.js): funciona sin conexión
```

| Decisión | Motivo |
|---|---|
| Sin backend, datos en IndexedDB | Requisito del PMV: hosting gratuito, sin servidor ni costos. Cada dispositivo es independiente. |
| Dominio en TypeScript puro | El motor, la máquina de estados y las métricas no dependen de React ni del navegador: se prueban con `node --test` y se podrían portar a Python (o a un backend) sin reescribir la UI. |
| Enrutador por hash (`#/armario`) | Funciona en GitHub Pages sin reglas de reescritura. |
| `ProfileRepo` como única puerta a los datos | Aplica el aislamiento por perfil en un solo lugar (ver §6). |
| Recomendador basado en reglas y explicable | Sin datos históricos no hay base para un modelo; la interfaz `Recommender` deja la puerta abierta (docs/ALGORITMO.md). |
| esbuild + API de Tailwind v4 | Build en ~1 s, sin Vite ni dependencias adicionales. |
| Sin IA generativa ni servicios de pago | Reglas determinísticas suficientes; todo gratuito. |

### Estructura

```
smartwardrobe/
├── package.json · tsconfig.json · .gitignore
├── scripts/
│   ├── build.mjs          # esbuild + Tailwind → dist/
│   ├── serve.mjs          # servidor estático local (con --lan para el celular)
│   └── test-unit.mjs      # compila y corre tests/unit con node --test
├── public/                # index.html (CSP), manifest, sw.js, iconos
├── src/
│   ├── main.tsx · styles.css
│   ├── domain/            # lógica pura (probada con pruebas unitarias)
│   │   ├── types.ts       # modelo de datos
│   │   ├── catalog.ts     # categorías, colores, estilos, eventos
│   │   ├── status.ts      # máquina de estados
│   │   ├── colors.ts      # compatibilidad cromática
│   │   ├── weather.ts     # Open-Meteo + caché + modo manual
│   │   ├── planning.ts    # métricas de uso desde el historial, conflictos de planes
│   │   ├── stats.ts       # indicadores (con "datos insuficientes")
│   │   └── recommender/   # config · features · engine · explain · types
│   ├── data/              # db · repo · images · backup · demo
│   └── ui/                # App, store, router, hooks, components/, screens/ (12 pantallas)
├── tests/
│   ├── unit/              # 32 pruebas de dominio
│   └── e2e/e2e.mjs        # 16 escenarios en Chromium real (Playwright)
├── docs/
└── .github/workflows/deploy.yml   # despliegue automático a GitHub Pages
```

### Modelo de datos (almacenes de IndexedDB)

`profiles` · `preferences` (1:1 con perfil) · `garments` · `images` · `statusHistory` ·
`maintenance` · `outfits` · `recommendations` · `ratings` · `blocked` · `wears` · `planned`.
Todos los almacenes de datos tienen clave `id` (UUID) e índice `profileId`; `statusHistory` y
`maintenance` también se indexan por `garmentId`, y `wears`/`planned` por `[profileId, date]`.
Las operaciones compuestas (cambio de estado + historial + mantenimiento; registro de uso +
actualización de conteos) se hacen en **una transacción**. Las migraciones de esquema viven
en `src/data/db.ts` (`upgrade`, por versión). Los tipos están en `src/domain/types.ts`.

---

## 2. Ejecución local

Requisitos: **Node.js 20 o superior**.

```bash
npm install
npm run build        # genera dist/
npm run serve        # http://127.0.0.1:5173
```

Desarrollo con recompilación automática: `npm run dev`.

## 3. Pruebas

```bash
npm test                 # 32 pruebas unitarias del dominio (node --test)
npx playwright install chromium   # solo la primera vez
npm run test:e2e         # 16 escenarios E2E en Chromium (build + servidor incluidos)
npm run typecheck        # revisión de tipos con TypeScript
```

Las pruebas E2E simulan Open-Meteo con respuestas de prueba (éxito y falla de red); nunca
se presentan como datos reales. `SCREENSHOTS=1 npm run test:e2e` guarda capturas en
`tests/e2e/screens/`.

**Estado verificado en el entorno de desarrollo:** unitarias 32/32 y E2E 16/16 superadas;
`tsc` sin errores en dominio, datos y pruebas. La interfaz React se revisó con un *shim*
de tipos, porque `@types/react` no estaba disponible en ese entorno. Al ejecutar
`npm install && npm run typecheck` en tu equipo se revisa con los tipos oficiales.
Si aparece algún error de tipos menor, no afecta la ejecución: el comportamiento está
cubierto por las pruebas E2E.

## 4. Publicar gratis (para usarla desde cualquier celular)

### Opción A — GitHub Pages (automático)
1. Crea un repositorio en GitHub y sube este proyecto.
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Cada `git push` a `main` ejecuta `.github/workflows/deploy.yml`: corre las pruebas
   unitarias, compila y publica en `https://<usuario>.github.io/<repositorio>/`.

### Opción B — Cloudflare Pages
*Workers & Pages → Create → Pages → Connect to Git*. Build command `npm run build`,
output directory `dist`. O, sin Git, sube la carpeta `dist/` con *Direct Upload*.

Ambas opciones sirven por **HTTPS**, que es requisito para instalar la PWA, usar el
service worker (modo sin conexión) y la geolocalización.

## 5. Acceso desde el celular

- **Recomendado:** abre la URL publicada (GitHub/Cloudflare Pages) e instálala:
  Android/Chrome → menú ⋮ → *Instalar aplicación*; iPhone/Safari → Compartir → *Agregar a inicio*.
- **Red local sin publicar (pruebas):** `npm run build && node scripts/serve.mjs 5173 --lan`
  y abre en el celular la dirección `http://IP-del-PC:5173` que muestra la consola.
  Al ser HTTP, funciona todo **excepto** instalar como PWA, el modo sin conexión y la
  geolocalización: los navegadores exigen HTTPS para esas funciones (con la excepción de
  `localhost`). La cámara sí funciona, porque se abre mediante el selector de archivos.
- **Importante:** cada navegador o dispositivo tiene su **propio** armario. Para usar el
  mismo armario en el computador y en el celular, exporta un respaldo en uno y restáuralo
  en el otro. No hay sincronización automática (ver docs/LIMITACIONES.md).

## 6. Seguridad y privacidad

| Medida | Implementación |
|---|---|
| Aislamiento entre perfiles | `ProfileRepo` filtra por índice `profileId`. Una lectura por id de otro perfil devuelve "no encontrado" y una escritura sobre un registro ajeno se rechaza. Está probado en E2E manipulando la URL. |
| Fotos | Se valida el contenido real (decodificación), con límite de 15 MB. Se re-codifican a JPEG, lo que **elimina el EXIF y el GPS**. Se guardan en IndexedDB, nunca como archivos públicos. |
| PIN opcional | PBKDF2-SHA256 (150 000 iteraciones, sal aleatoria). Es una **barrera de conveniencia** entre personas que comparten un dispositivo, no cifrado: quien tenga acceso a las herramientas del navegador puede leer los datos. |
| Content-Security-Policy | Solo scripts propios. Conexiones permitidas solo a Open-Meteo. Sin `eval`. |
| Ubicación | La geolocalización se redondea a unos 100 m y solo se envía a Open-Meteo. |
| CSV | Las celdas que empiezan por `= + - @` se neutralizan (inyección de fórmulas). |
| Sin secretos | No hay claves ni variables de entorno sensibles: Open-Meteo no requiere API key. |

Los riesgos propios del uso multi-dispositivo están en docs/LIMITACIONES.md.

## 7. Clima

Open-Meteo (`api.open-meteo.com`, sin clave): pronóstico diario de hasta 16 días,
geocodificación por nombre de ciudad, caché de 1 hora y *timeout* de 8 s. Sus condiciones
de uso indican que el API gratuito es solo para uso **no comercial**, con menos de 10 000
llamadas al día, y que los datos tienen licencia CC BY 4.0
(https://open-meteo.com/en/terms). Un uso comercial requiere su plan de pago o un
servidor propio. Si el servicio falla, no hay ubicación configurada o la fecha supera el
horizonte, la app pasa al **modo manual** y cada recomendación indica de qué fuente salió
el clima.
