# Simulacra · La Granja 3D

Una simulación de vida artificial ambientada en una **granja viva en 3D**: un
cuadro vivo isométrico donde gallinas, ovejas y vacas pastan mientras los zorros
acechan. El ecosistema se equilibra solo… hasta que **tú intervienes como un
dios**: trae la lluvia, desata una peste, suelta un zorro o arrasa un rincón con
un meteorito.

**En vivo:** https://eljocker.github.io/Simulacra

## Documentación

- [`docs/BRIEF.md`](docs/BRIEF.md) — documento de concepto y requerimientos (la visión).
- [`docs/GUIA-DESARROLLO.md`](docs/GUIA-DESARROLLO.md) — guía de desarrollo: cómo el
  código actual mapea a esa visión y los próximos pasos.
- [`docs/PLAN-3D.md`](docs/PLAN-3D.md) — la evaluación y el camino del render 3D.

## Stack

Proyecto moderno, separado por responsabilidades:

- **Vite + React + TypeScript**, empaquetado a un **único `index.html`**
  autocontenido (`vite-plugin-singlefile`) — el mismo build sirve para GitHub
  Pages y como Artifact de Claude.
- **`src/sim/`** — motor de simulación **puro** (sin DOM, determinista,
  serializable y testeable): `rng`, `types`, `species`, `grid` (hash espacial),
  `grass`, `behavior`, `world` (orquestador + `serialize`/`load`).
- **`src/engine/`** — `loop` (bucle de tiempo fijo + persistencia) y `store`
  (estado reactivo mínimo compatible con `useSyncExternalStore`).
- **`src/render3d/`** — `ThreeRenderer`: escena 3D low-poly con Three.js
  (cámara isométrica, día/noche, clima). El `src/render/` 2D queda como
  referencia; ambos implementan la misma interfaz `IRenderer`, así que el motor
  no cambia entre renderers.
- **`src/persistence/`** — `db`: capa de IndexedDB (snapshots en el navegador).
- **`src/ui/`** — React: `HUD`, `GodPanel` (panel divino), `PopulationChart`.
- **`scripts/`** — arneses que corren el motor puro en Node: `balance.ts`
  (equilibrio) y `snapshot.ts` (fidelidad de serialización).

## Desarrollo

```bash
npm install
npm run dev         # servidor de desarrollo
npm run build       # bundle único en dist/index.html
npm run typecheck   # tsc --noEmit
npm run sim:check   # verifica el equilibrio del ecosistema (8 semillas)
npm run snap:check  # verifica que los snapshots reproduzcan la simulación
```

## La simulación

Cada animal percibe su entorno (rejilla espacial), decide (huir, cazar, buscar
pasto o comida, deambular), gasta energía al moverse y la recupera al comer.
Con energía suficiente se reproduce y su cría hereda los genes (velocidad, vista,
tamaño) con pequeñas mutaciones, así los rasgos **evolucionan** entre
generaciones. Cada especie tiene una **capacidad de carga** (cupo del corral),
de modo que las tres conviven en vez de excluirse. Un leve efecto rescate evita
la extinción permanente. El equilibrio está verificado en 8 semillas
independientes (`npm run sim:check`).

## Cámara

Vista **isométrica fija** (tipo diorama / cuadro): no rota sola. Se ajusta con
**arrastre** (girar), **rueda** (zoom) y **flechas / ± del teclado**, y queda
quieta donde la dejes.

## Panel divino

- **Clima** — ☀️ Sol · 🌧️ Lluvia (el pasto crece) · 🏜️ Sequía (el pasto muere).
- **Poblar** — suelta gallinas, ovejas, vacas o zorros.
- **Poderes** — ✨ Bendición (todos se sacian y se reproducen), 🦠 Peste
  (enferma al rebaño), 🌾 Alimentar y ☄️ Meteorito.

## Persistencia (IndexedDB)

Todo el estado de la simulación es **serializable** (incluido el estado del RNG,
así una carga reproduce la evolución exacta). La sesión se **autoguarda** y se
**restaura sola** al volver. Desde *Panel divino → Memoria* podés **guardar
snapshots** con nombre y **cargarlos** o borrarlos — recrear la granja en
cualquier instante. Vive en el navegador; no requiere servidor.
