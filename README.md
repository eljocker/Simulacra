# Simulacra · Caldo de partículas primordial

Una simulación de **vida artificial** en un único archivo HTML, sin dependencias.
Miles de partículas de hasta seis especies interactúan a través de una matriz de
atracción y repulsión: nadie programa las "criaturas" —células, enjambres y
organismos que se persiguen **emergen** de las reglas.

Modelo: *Particle Life* (curva de fuerza de Tom Mohr) sobre un espacio toroidal,
con partición espacial en rejilla y arreglos tipados para correr fluido con miles
de partículas.

## Verlo

- **En vivo (GitHub Pages):** se publica solo en cada push vía el workflow de
  `.github/workflows/deploy-pages.yml`.
- **Local:** abre `index.html` en cualquier navegador. No necesita servidor.

## Controles

- **Reglas** — genera una biología nueva al instante.
- **Ecosistemas** — presets: Células, Enjambre, Persecución, Depredador, Órbitas, Caos.
- **Matriz de interacción** — clic izquierdo suma atracción, clic derecho suma repulsión.
- **Sliders** — población, especies, radio de influencia, fuerza, fricción y estela.
- **Arrastra** sobre el lienzo para agitar el caldo · **shift + arrastra** para dispersar.
- **Copiar enlace del universo** — comparte tus reglas y parámetros por URL.

## Cómo funciona

Cada partícula tiene posición, velocidad y especie. Para cada par dentro del radio
de influencia se aplica una fuerza que depende de la especie de ambas: repulsión
en el núcleo cercano y atracción/repulsión modulada por la matriz más allá. La
fricción disipa energía cada paso y el espacio envuelve en los bordes, de modo que
las estructuras fluyen sin fronteras.
