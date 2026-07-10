# Simulacra · Terrario de vida artificial

Un **ecosistema vivo** en un único archivo HTML, sin dependencias. Plantas,
herbívoros y depredadores comparten un estanque: comen, huyen, cazan, se
reproducen (con mutaciones que se heredan) y mueren. Nadie guía a nadie — las
poblaciones se equilibran solas en oscilaciones de tipo depredador-presa.

## Verlo

- **En vivo (GitHub Pages):** https://eljocker.github.io/Simulacra — se publica
  solo en cada push vía `.github/workflows/deploy-pages.yml`.
- **Local:** abre `index.html` en cualquier navegador. No necesita servidor.

## Qué estás viendo

| | |
|---|---|
| 🟢 **Planta** | Alimento que crece solo por el estanque. |
| 🐟 **Herbívoro** | Busca plantas para comer; huye de los depredadores. |
| 🦈 **Depredador** | Caza herbívoros. |

Cada ser tiene energía, edad y genes (velocidad, vista, tamaño). Con energía
suficiente se reproduce y su cría hereda los genes con pequeñas mutaciones —
así el terrario **evoluciona** con el tiempo. Sin comida, la energía baja y muere.

## Controles

- **Pausa / Reiniciar** el terrario.
- **+ Comida / + Herbívoro / + Depredador** para intervenir.
- **Clic** en el estanque suelta comida; **pasa el cursor** sobre un ser para ver
  su energía, edad y genes.
- Sliders de **velocidad del tiempo** y **crecimiento de plantas**.
- Una **gráfica de población** muestra en vivo el sube-y-baja de las tres especies.

## Cómo funciona

Cada criatura percibe a su alrededor (rejilla espacial para eficiencia) y toma una
decisión simple: el herbívoro huye si ve un depredador, si no busca la planta más
cercana, y si no deambula; el depredador persigue al herbívoro más cercano. Comer
da energía, moverse la gasta. Al superar un umbral se reproducen; al agotarla o
envejecer, mueren. Un leve **efecto rescate** hace que lleguen nuevos individuos
cuando una especie queda al borde de la extinción, de modo que el terrario nunca
muere del todo y puedes dejarlo corriendo indefinidamente.
