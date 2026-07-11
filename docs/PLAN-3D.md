# Evaluación: el salto a 3D

> Estado: **adoptado**. El 3D con Three.js es ahora la app principal (la vista
> isométrica que se sirve en `/`). Corre el *mismo* motor de simulación que la
> versión 2D. Este documento explica qué se probó, qué se reutiliza y cómo sería
> el camino completo hacia el look Low-Poly/Ghibli del [`BRIEF.md`](./BRIEF.md).

## 1. Qué se construyó (prueba de concepto)

- Un renderer WebGL (`src/render3d/three.ts`) que implementa la **misma interfaz**
  `IRenderer` que el renderer 2D (`resize`, `draw`).
- Una entrada aparte (`three.html` → `src/main3d.tsx`) que monta **exactamente la
  misma App de React** (HUD, panel divino, engine, store) y solo **inyecta** el
  renderer 3D:
  ```tsx
  <App makeRenderer={(canvas) => new ThreeRenderer(canvas)} />
  ```
- Escena low-poly: suelo, granero, estanque, árboles, animales instanciados
  (`InstancedMesh`, un *draw call* por especie), iluminación hemisférica +
  direccional con **ciclo día/noche** atado a `world.clock`, lluvia por partículas
  y **cámara con órbita suave** (el "cuadro vivo" del brief).
- Se compila al **único `index.html`** que se sirve en Pages (Three.js incluido,
  ~180 KB gz). La cámara es **isométrica fija** (diorama), ajustable con
  arrastre/rueda/teclado — no rota sola.

## 2. La tesis que valida (lo importante)

> **El motor `src/sim/` no se tocó ni una línea.** Cambiar de 2D-canvas a 3D-WebGL
> fue *sólo* escribir un nuevo renderer y una entrada.

Esto confirma que la decisión de arquitectura (núcleo puro + renderer inyectado,
ver [`GUIA-DESARROLLO.md`](./GUIA-DESARROLLO.md) §1) paga: podemos subir el nivel
gráfico sin arriesgar la lógica, el balance ni el determinismo. El mismo
`npm run sim:check` sigue siendo válido para ambos renderers.

## 3. Qué se reutiliza vs. qué es nuevo

| | Reutilizado tal cual | Nuevo para 3D |
|---|---|---|
| Simulación (`src/sim`) | ✅ 100% | — |
| Engine + store (`src/engine`) | ✅ 100% | — |
| UI React (`src/ui`) | ✅ 100% | — |
| Render | interfaz `IRenderer` | `src/render3d/*` (escena, mallas, luces, cámara) |
| Assets | — | mallas low-poly (hoy primitivas; luego modelos) |

## 4. Decisión de motor (recomendación)

El brief plantea *Web-First (Three.js/Babylon)* vs *Nativo (Unity/Godot)*.

**Recomendación: seguir Web-First con Three.js.** Razones:

- Corre en el navegador de cualquier Smart TV / mini-PC / Raspberry Pi → encaja
  con el modelo **SaaS B2B** sin instaladores.
- Reutiliza **todo** lo ya construido (sim, engine, UI, build de archivo único).
- El prototipo ya demostró viabilidad, incluso con WebGL por software.

Unity/Godot solo se justifican para *instalaciones premium* con gráficos muy
superiores; y aun así el núcleo de reglas se podría portar, no rehacer.

## 5. Camino hacia la calidad "Ghibli/Low-Poly"

1. **Modelos reales** (glTF) por especie en vez de primitivas — con animación
   simple de caminar (o *squash & stretch* por shader para mantenerlo barato).
2. **Suelo con relieve** (ruido de altura) + parches de pasto instanciados que
   reaccionen al viento; el color del suelo puede mapear la densidad de
   `GrassField`.
3. **Cielo y atmósfera:** *skydome* con degradé día/noche, nubes por ruido
   (Perlin/Simplex) — cierra el pilar *anti-loop* del brief.
4. **Estaciones:** paletas y props por estación (nieve, hojas de otoño).
5. **Post-procesado suave** (bloom sutil, *tone mapping*) para el look cálido,
   cuidando que siga corriendo fluido en hardware modesto.

## 6. Consideraciones para 24/7 (prioridad del brief)

- **Instancing y draw calls acotados:** ya es un *draw call* por especie; mantener
  esa disciplina al agregar props.
- **Nada que crezca sin cota:** vigilar buffers de partículas, geometrías creadas
  en caliente y *dispose* de lo que se reemplaza (el renderer ya libera el suelo
  al redimensionar).
- **Sombras opcionales:** se desactivaron en el prototipo (frágiles en render por
  software y caras); activarlas solo en hardware con GPU real, detrás de un flag.
- **Prueba de estrés de horas** midiendo memoria antes de considerar producción.

## 7. Cómo verlo

```bash
npm run dev     # app 3D en el navegador
npm run build   # bundle único en dist/index.html
```
En producción es la app principal: `…/Simulacra/`.
