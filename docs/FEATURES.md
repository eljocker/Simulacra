# Features útiles — Simulacra, por prioridad de utilidad

> Backlog vivo. Cada ítem se justifica contra el **brief** (software ambiental /
> *zero-player* / "cuadro vivo" anti-loop, sincronizado con el mundo real, para
> salas de espera, hoteles, clínicas y hogares). El orden es por **utilidad
> percibida ÷ costo**, no por dificultad. Lo ya hecho está al final para no
> reproponerlo.
>
> Convención de esfuerzo: **S** (horas) · **M** (1–2 días) · **L** (varios días).

---

## Nivel 0 — Alta utilidad, bajo costo (hacer primero)

1. **Sonido ambiente generativo** · M · *inmersión*
   Un paisaje sonoro suave y sin loop audible (viento, pájaros, un cencerro
   lejano) que reacciona al clima y a la hora real. Es lo que convierte "una
   pantalla bonita" en "una presencia" en una sala. Se enchufa como dependencia
   inyectada igual que el reloj real; el núcleo `sim/` no se toca. Requiere un
   toggle de silencio (obligatorio para clínicas) y arranque tras gesto del
   usuario (política de autoplay de los navegadores).

2. **Ciclo de estaciones + clima ligado al mundo real** · M · *anti-loop, sync real*
   Hoy el sol ya sigue el reloj del sistema. El paso natural es que el **mes real**
   module paleta, largo del día, tasa de crecimiento del pasto y probabilidad de
   lluvia. Nieve en invierno, dorados en otoño. Es el multiplicador de variedad
   más barato que existe: reusa el noise y el clima ya presentes, y hace que la
   misma granja "se sienta distinta" en marzo y en julio.

3. **Modo pantalla / "kiosco" con auto-galería** · S · *caso de uso B2B directo*
   Entrar solo a modo galería por parámetro de URL (`?kiosk=1`), reintento de
   render tras pérdida de contexto WebGL, y anti-burn-in (deriva lentísima de
   cámara dentro de límites, sin marear). Es el requisito literal para venderlo a
   una sala de espera y hoy falta el "encendelo y olvidate 24/7".

4. **Nombres propios para las criaturas** · S · *apego, storytelling*
   Un banco de nombres determinista (semilla → nombre) para que la Bitácora y la
   Ficha digan "Nació Manuela, cría de Rosa" en vez de "#41". Costo mínimo,
   enorme salto en identificación emocional — que es exactamente el problema que
   originó la Bitácora ("que nadie desaparezca porque sí").

---

## Profundidad del ecosistema (pedidos recientes) — ✅ hechos

> Bloque de ciclo de vida más rico. Todos se apoyan en el núcleo `sim/` puro y
> determinista; se validaron headless con `sim:check` (8/8) y `snap:check`.

- **E1. Crecer con la edad hasta la adultez** — ✅ hecho
  La cría nace a la mitad del tamaño y crece (curva suave por edad) hasta el
  tamaño adulto a ~28% de su vida, y ahí se estabiliza. Función pura
  (`growthFactor`/`lifeStage`), solo render + Ficha (que ahora muestra
  Cría/Joven/Adulto y % de tamaño). No toca la dinámica → balance intacto.

- **E2. Gallinas ponen huevos con gestación** — ✅ hecho
  Las gallinas ponen un **huevo** (entidad `Egg`) que incuba 6s en el suelo y
  luego eclosiona en un pollito. El huevo cuenta para el cap (población acotada)
  y se ve en la escena (ovoide crema que se bambolea) y en la Bitácora
  ("puso un huevo" → "nació").

- **E3. Manadas / bandadas + puesta localizada** — ✅ hecho
  Gallinas y ovejas se **agrupan** con boids suaves (cohesión + separación +
  alineación + wander), con espacio personal para no encimarse. Como el huevo se
  pone en la posición de la gallina, cae dentro de la bandada.

- **E4. Carroñeros aéreos + su propia mortalidad** — ✅ hecho
  Buitres (`Scavenger`) que circulan alto y **descienden a devorar los corpses**
  antes de que suba el alma (el cuerpo se vuelve nutriente, no hay alma). Los
  cuerpos lejanos igual liberan su alma (se conserva el angelito). Envejecen y se
  mueren de hambre/vejez → sueltan su propia alma; se reproducen con un mínimo
  siempre en el cielo.

- **E5. Micro-hábitats + agua para acuáticos** — ✅ hecho (núcleo)
  Regla del agua: los terrestres **bordean la laguna** y nunca entran; los
  **patos** (`Duck`) viven **solo** dentro del estanque. La laguna ahora la posee
  el `sim` (coincide exacto con el agua visible). Además, afinidad de hábitat
  suave: cada especie tiene un `home` y tiende a su zona cuando está ociosa.
  *Pendiente (profundidad):* preferencia por biomas visibles (bosque/roquedal)
  — requiere compartir posiciones de árboles/rocas entre render y `sim`; encaja
  con "Biomas configurable" (#7).

---

## Nivel 1 — Alta utilidad, costo medio

5. **Cámara "sigue a un ser"** · M · *contemplación dirigida*
   Al inspeccionar una criatura (Ficha ya existe), un botón "seguir" que ancla la
   cámara a ese individuo con lag suave. Convierte la observación pasiva en una
   historia que se puede acompañar. Reusa el picking y el rig de cámara actuales.

6. **Línea de tiempo / rebobinar desde snapshots** · L · *el "director" del cuadro*
   Ya serializamos estado completo y bit-exacto. Falta guardar snapshots
   periódicos en un anillo y una barra para saltar a "hace 3 días" y ver cómo se
   llegó al presente. Es la killer feature de un sim determinista y ya está el 80%
   de la infraestructura (IndexedDB + `serialize/load`).

7. **Biomas / relieve configurable** · M · *variedad estructural*
   Un setting de "carácter del terreno" (pradera, colinas, cerca del agua) que
   cambie amplitud del noise, tamaño del estanque y densidad de árboles. Extiende
   los settings de Tamaño/Densidad recién agregados y ataca directamente el
   anti-loop: no dos granjas iguales.

8. **Más especies + una red trófica real** · L · *profundidad del ecosistema*
   Conejos, halcones, abejas/flores (polinización → pasto). Cada especie nueva
   multiplica las dinámicas emergentes. Costo real: re-balancear (ya existe
   `npm run sim:check` con 8 semillas como red de seguridad) y modelar geometría
   low-poly nueva.

9. **Métricas del ecosistema / "salud del cuadro"** · M · *lectura de un vistazo*
   Un panel opcional con biodiversidad, edad promedio, natalidad vs mortalidad y
   una racha de "días estables". Útil para el dueño de la pantalla (¿está sano lo
   que muestro?) y como gancho de contemplación.

---

## Nivel 2 — Diferenciales de producto (más inversión)

10. **Compartir / permalink de una granja** · M · *viralidad, B2C*
    Exportar la semilla + settings a una URL corta para regalar "tu granja".
    Determinismo ya garantiza que el otro vea lo mismo. Palanca de crecimiento
    barata sobre infra existente.

11. **Eventos raros memorables** · M · *sorpresa, anti-monotonía*
    Auroras, lluvia de estrellas, un ciervo blanco que cruza una vez por semana,
    arcoíris tras la lluvia. Baja frecuencia, alta memorabilidad: lo que hace que
    alguien diga "¿viste eso?" y vuelva a mirar.

12. **Genética visible + linajes** · L · *narrativa emergente*
    Que los genes (velocidad/sentido/tamaño, ya simulados) se noten en el cuerpo
    y que la Ficha muestre árbol genealógico ("descendiente de la primera vaca").
    Convierte números en dinastías.

13. **Accesibilidad y rendimiento** · M · *requisito, no lujo*
    `prefers-reduced-motion` (ya parcial en CSS), pausa por batería/pestaña
    oculta, límite de instancias en equipos modestos, contraste alto opcional.
    Imprescindible para el mercado de clínicas y para correr 24/7 sin recalentar.

14. **Modo noche real / "salvapantallas"** · S · *coherencia con el sync real*
    De madrugada (hora real): oscurecer, animales durmiendo en el granero,
    luciérnagas, sonido casi nulo. Refuerza la promesa de que el cuadro **vive el
    mismo día que quien lo mira**.

---

## Nivel 3 — Estratégico / plataforma

15. **"Temas" de ecosistema intercambiables** · L · *escala del producto*
    La arquitectura (`sim/` puro + `IRenderer`) permite que la granja sea el
    primer *tema*: arrecife de coral, bosque, ciudad de hormigas. Es el camino de
    "un demo" a "un producto con catálogo".

16. **Deploy configurable para clientes** · M · *B2B llave en mano*
    Un JSON de configuración (logo tenue de la marca, paleta, especies activas,
    settings por defecto) horneado en el build de un cliente. Monetización directa
    del single-file actual.

17. **API de estado / integraciones** · L · *"real-world sync" ampliado*
    Que el cuadro reaccione a datos externos opcionales: clima real de la ciudad,
    calendario (más actividad en horario laboral), un webhook que suelte una
    bendición. Profundiza el pilar de sincronía con el mundo real del brief.

---

## Ya implementado (referencia, no reproponer)

- Ecosistema 3D isométrico low-poly con gravedad geométrica y movimiento calmo.
- Sol alineado al reloj real del sistema + día/noche.
- Persistencia IndexedDB: autosave + snapshots con nombre, serialización
  bit-exacta (incluye RNG y pasto a full precisión).
- Bitácora de eventos (nacimientos/muertes con causa).
- Muerte en dos tiempos: el cuerpo queda **tumbado en gris** unos segundos de
  duelo y **luego** sube el alma (angelito) que se desvanece en el cielo.
- Settings de **tamaño del terreno** y **densidad de población**.
- Ciclo de vida (E1–E5): crecimiento por edad, huevos con gestación, bandadas,
  buitres carroñeros mortales, regla del agua + patos acuáticos.
- Depredadores reclaman presas distintas (no se enciman).
- Hambre y comida reales: energía por especie visible en la Ficha (estado de
  hambre), acto de comer visible (pose de pastoreo + bocado), frutas
  (manzanas/moras) que caen de los árboles como comida del entorno, y muerte por
  hambre cuando la energía llega a cero.
- **Inspeccionar un ser con clic** → Ficha con energía, edad, genes e historia.
- Modo galería / *zero-player* (tecla **G**).
- Ritmo del ecosistema ajustable (0.5×–8×) desacoplado del reloj del cielo.
- Escena procedural anti-loop: relieve por fBm, nubes a la deriva, viento.
- Verificación headless: balance (`sim:check`, 8/8) y snapshot (`snap:check`).
