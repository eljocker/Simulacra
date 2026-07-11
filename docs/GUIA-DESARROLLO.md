# Guía de Desarrollo — SIMULACRA

> Documento de trabajo que conecta la **visión** ([`BRIEF.md`](./BRIEF.md)) con el
> **código** que vive en este repositorio. El brief es el norte; esta guía dice
> dónde estamos y cómo avanzar sin romper la arquitectura.

El brief define Simulacra como **software ambiental / *zero-player* / arte
dinámico**: un "cuadro vivo" que nunca se repite, para salas de espera, hoteles,
clínicas y hogares. El prototipo actual (una granja autónoma en **Vite + React +
TypeScript**, desplegada en GitHub Pages) ya cubre buena parte de la **Fase 1** y
partes de la 2 y 3 del roadmap.

---

## 1. Principio de arquitectura (lo que no se negocia)

> **El núcleo de simulación (`src/sim/`) es puro y sin DOM.**
> Render, reloj real, clima y audio entran como **dependencias inyectadas**.

Esto es lo que habilita las tres promesas del brief:

- **Anti-loop y estabilidad 24/7** → la lógica es determinista y testeable.
  Ya se valida el equilibrio corriendo el motor headless en Node:
  `npm run sim:check` (8 semillas, sin navegador).
- **Cambiar de motor gráfico sin reescribir** → hoy es canvas 2D (`src/render/`);
  mañana puede ser Three.js/WebGL para el look Low-Poly/Ghibli del brief, y
  `src/sim/` no se toca.
- **Cero interacción** → la UI (`src/ui/`) está desacoplada del motor
  (`src/engine/store.ts`), así que ocultarla es un cambio de presentación.

Mapa de capas:

| Capa | Carpeta | Rol |
|---|---|---|
| Simulación pura | `src/sim/` | Reglas del mundo (sin DOM, determinista) |
| Motor / glue | `src/engine/` | Bucle de tiempo fijo + store reactivo |
| Render | `src/render/` | Canvas + sprites + paleta |
| UI | `src/ui/` | HUD, panel divino, gráfica |
| Validación | `scripts/balance.ts` | Corre el núcleo en Node |

## 2. Los 5 pilares del brief vs. el código

| Pilar (brief §3–4) | Estado | Dónde / qué falta |
|---|---|---|
| **3.1 Cero interacción** (*zero-player*) | 🟡 Parcial | La UI es visible y hay "modo dios". Falta un **modo galería** que oculte todo + menú de config previo. |
| **3.2 Ciclo día/noche** | 🟢 Hecho (reloj interno) | `World.nightFactor`, `renderer.drawNight`. Falta **atarlo al reloj del sistema real / geolocalización**. |
| **3.2 Clima en tiempo real** | 🟡 Simulado | `weather` + `GrassField.regrow`, lluvia/sequía. Falta **API meteorológica** (OpenWeatherMap). |
| **3.2 Estaciones** | 🔴 Pendiente | Modular paleta, crecimiento y natalidad por estación. |
| **3.3 Anti-loop procedural** | 🟡 Base | `rng.ts` con semilla. Falta **ruido Perlin/Simplex** para nubes, viento y distribución de pasto/árboles. |
| **3.4 IA por necesidades** | 🟢 Base sólida | `src/sim/behavior.ts` (hambre, huida, caza, pastoreo, deambular). Falta **sed** y **descanso nocturno** formal. |
| **3.5 Reproducción + mutación** | 🟢 Hecho | `world.childGenes` — genes (velocidad, vista, tamaño) heredables con mutación. |
| **3.5 Crecimiento** (árboles/estructuras) | 🔴 Pendiente | Entidades con estado de crecimiento a largo plazo. |
| **4 Estabilidad 24/7** | 🟡 A endurecer | Bucle de tiempo fijo, *typed arrays*. Falta **prueba de larga duración vigilando memoria**. |
| **4 Audio procedural** | 🔴 Pendiente | Capa de audio que responda a hora y clima. |

## 3. Próximos pasos concretos (desde este código)

1. **Modo galería / *zero-player*.** Flag que oculte HUD y panel; menú de config
   previo (ubicación, especies, densidad). El motor ya está desacoplado de la UI.
2. **Reloj real + estaciones.** Inyectar la hora del sistema en `World.clock` vía
   una interfaz `TimeSource`; añadir `season` que module paleta, pasto y natalidad.
   ⚠️ *Determinismo:* el reloj real entra como **dependencia inyectada**, nunca
   como `Date.now()` disperso, para no romper `npm run sim:check`.
3. **Ruido procedural.** Sustituir la siembra aleatoria de pasto por un campo de
   **Simplex noise** animado (nubes, viento, parches de hierba) → *anti-loop* real.
4. **Sed + agua.** El estanque ya existe como prop: convertirlo en **recurso**
   (como el pasto) y añadir la necesidad `thirst` en `behavior.ts`.
5. **Clima real.** Un `WeatherSource` con caché (no llamar la API por frame) que
   setee `world.weather`; *fallback* a clima simulado sin red.
6. **Endurecer 24/7.** Prueba de estrés de horas vigilando memoria; garantizar que
   ninguna estructura (efectos, grano, historial) crezca sin cota.
7. **Evaluar salto a 3D** (Three.js) para el estilo Low-Poly/Ghibli del brief; el
   motor `src/sim/` es headless y se reutiliza bajo cualquier renderer.

## 4. Cómo correr

```bash
npm install
npm run dev         # desarrollo
npm run build       # bundle único (dist/index.html)
npm run typecheck   # tsc --noEmit
npm run sim:check   # valida el equilibrio del ecosistema (8 semillas)
```
