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

## Profundidad del ecosistema (pedidos recientes)

> Bloque de ciclo de vida más rico. Todos se apoyan en el núcleo `sim/` puro y
> determinista, así que se validan headless con `sim:check`. Ordenados por
> utilidad ÷ costo dentro del bloque.

- **E1. Crecer con la edad hasta la adultez** · S–M · *lo más visible por el costo*
  Hoy el tamaño de render ya sale de `genes.size`; falta una **curva de
  crecimiento por edad**: la cría nace pequeña y escala hasta un tamaño adulto a
  cierta edad, y ahí se estabiliza. Se refleja solo en la escala del modelo y en
  la Ficha (que ya muestra edad). Cambio chico, lectura enorme: se ve a los
  animales *crecer*. Ojo con el balance (los caps y la reproducción no deberían
  depender del tamaño instantáneo).

- **E2. Gallinas ponen huevos con gestación** · M · *reproducción visible*
  En vez de aparecer la cría de la nada, la gallina pone un **huevo** que
  descansa en el suelo un tiempo de incubación (barrita/eclosión) y recién
  entonces nace el pollito. Reusa el patrón que acabamos de hacer con los
  *corpses* (una entidad no-animal con temporizador que se transforma). Se ve el
  huevo en la simulación y en la Bitácora ("Huevo puesto" → "Nació").

- **E3. Manadas / bandadas + puesta localizada** · M · *comportamiento emergente*
  Las gallinas tienden a **agruparse** (boids: cohesión + separación + alineación
  suave, dentro del steering ya existente) y ponen los huevos **dentro de su
  zona de nido**, no en cualquier lado. Da grupos reconocibles y un "orden" que
  el ojo lee como vida, no como ruido.

- **E4. Carroñeros aéreos + su propia mortalidad** · M–L · *cierra el ciclo de la muerte*
  Un depredador aéreo (buitre/halcón) que **desciende a devorar los corpses**
  antes de que suba el alma — extiende directamente el sistema de cuerpos recién
  hecho. Estos carroñeros también **envejecen y mueren** (misma lógica de
  energía/vejez). Convierte la muerte en nutrientes y suma una capa vertical al
  cuadro.

- **E5. Micro-hábitats + agua para acuáticos** · L · *anti-loop estructural*
  Zonas con carácter propio (pastura, bosque, orilla, roquedal) donde cada
  especie tiene **preferencia de permanencia** (un campo de atracción por bioma
  en el steering). Y reglas de terreno: p. ej. **solo animales acuáticos entran
  a la laguna**, los terrestres la bordean. Es el mayor multiplicador de variedad
  y encaja con "Biomas configurable" (#7) — conviene hacerlos juntos.

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
- **Inspeccionar un ser con clic** → Ficha con energía, edad, genes e historia.
- Modo galería / *zero-player* (tecla **G**).
- Ritmo del ecosistema ajustable (0.5×–8×) desacoplado del reloj del cielo.
- Escena procedural anti-loop: relieve por fBm, nubes a la deriva, viento.
- Verificación headless: balance (`sim:check`, 8/8) y snapshot (`snap:check`).
