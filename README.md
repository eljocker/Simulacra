# Simulacra · La Granja

Una simulación de vida artificial ambientada en una **granja viva**: gallinas,
ovejas y vacas pastan mientras los zorros acechan. El ecosistema se equilibra
solo… hasta que **tú intervienes como un dios**: trae la lluvia, desata una
peste, suelta un zorro o arrasa un rincón con un meteorito.

**En vivo:** https://eljocker.github.io/Simulacra

## Documentación

- [`docs/BRIEF.md`](docs/BRIEF.md) — documento de concepto y requerimientos (la visión).
- [`docs/GUIA-DESARROLLO.md`](docs/GUIA-DESARROLLO.md) — guía de desarrollo: cómo el
  código actual mapea a esa visión y los próximos pasos.
- [`docs/PLAN-3D.md`](docs/PLAN-3D.md) — evaluación del salto a 3D (con prototipo
  Three.js funcionando en `/three.html`).

## Prototipo 3D

Hay un renderer 3D (Three.js) que corre **el mismo motor de simulación** — solo se
cambia el renderer inyectado. En vivo: **https://eljocker.github.io/Simulacra/three.html**

```bash
npm run build:3d    # bundle único en dist3d/three.html
```

## Stack

Proyecto moderno, separado por responsabilidades:

- **Vite + React + TypeScript**, empaquetado a un **único `index.html`**
  autocontenido (`vite-plugin-singlefile`) — el mismo build sirve para GitHub
  Pages y como Artifact de Claude.
- **`src/sim/`** — motor de simulación **puro** (sin DOM, determinista y
  testeable): `rng`, `types`, `species`, `grid` (hash espacial), `grass`,
  `behavior`, `world` (orquestador de sistemas).
- **`src/engine/`** — `loop` (bucle de tiempo fijo con acumulador) y `store`
  (estado reactivo mínimo compatible con `useSyncExternalStore`).
- **`src/render/`** — `renderer` sobre canvas + `sprites` de cada animal +
  `palette`. Dibuja pasto, granero, estanque, clima y ciclo día/noche.
- **`src/ui/`** — React: `HUD`, `GodPanel` (panel divino), `PopulationChart`.
- **`scripts/balance.ts`** — arnés que corre el motor puro en Node para validar
  que la granja no colapsa.

## Desarrollo

```bash
npm install
npm run dev         # servidor de desarrollo
npm run build       # bundle único en dist/index.html
npm run typecheck   # tsc --noEmit
npm run sim:check   # verifica el equilibrio del ecosistema (8 semillas)
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

## Panel divino

- **Clima** — ☀️ Sol · 🌧️ Lluvia (el pasto crece) · 🏜️ Sequía (el pasto muere).
- **Poblar** — suelta gallinas, ovejas, vacas o zorros.
- **Poderes** — ✨ Bendición (todos se sacian y se reproducen), 🦠 Peste
  (enferma al rebaño), 🌾 Alimentar y ☄️ Meteorito (herramientas de clic).
- **Clic** en el campo aplica la herramienta activa (esparcir grano o invocar
  un meteorito).
