# **Documento de Concepto y Requerimientos Iniciales**

## **Proyecto: SIMULACRA**

**Fecha:** Julio 2026

**Tipo de Software:** Software Ambiental / Zero-Player Game / Arte Dinámico

**Plataformas Objetivo:** Web (Navegador/Smart TVs), Desktop (PC/Mac), Pantallas Comerciales.

### **1\. Visión General (El "Elevator Pitch")**

**Simulacra** es un ecosistema digital autónomo diseñado para funcionar como un "cuadro vivo". No es un videojuego interactivo ni un video en bucle (loop). Es una simulación en tiempo real de un entorno (ej. una granja, un paisaje natural) que evoluciona de manera procedural. Su propósito principal es servir como arte ambiental dinámico para salas de espera, recepciones de hoteles, clínicas, o como fondo de relajación en hogares, garantizando que el espectador **nunca vea exactamente la misma escena dos veces**.

### **2\. Casos de Uso y Audiencia Objetivo**

* **B2B (Salud, Hostelería, Corporativo):** Salas de espera donde actualmente se usan pantallas con canales de noticias muteados o videos repetitivos de la naturaleza. Simulacra ofrece una experiencia premium, relajante y que reduce la ansiedad del usuario.  
* **B2C (Usuarios finales):** Como fondo de escritorio dinámico, salvapantallas interactivo o aplicación de relajación (segunda pantalla mientras se trabaja).

### **3\. Pilares Fundamentales (Core Features)**

Para que el proyecto cumpla su promesa, debe sostenerse sobre estos pilares técnicos y de diseño:

#### **3.1. Cero Interacción (Zero-Player)**

* La interfaz de usuario (UI) debe ser invisible durante la ejecución normal.  
* El usuario actúa únicamente como un "dios observador". No hay botones para alimentar animales ni acelerar el tiempo en la vista principal (la configuración se hace en un menú oculto previo).

#### **3.2. Sincronización con el Mundo Real**

* **Ciclo Día/Noche:** Vinculado al reloj del sistema (o geolocalización). Si son las 19:00 en la vida real, el sol se está poniendo en Simulacra.  
* **Clima en Tiempo Real:** Integración con una API meteorológica (ej. OpenWeatherMap). Si llueve en la ubicación física de la pantalla, llueve en la simulación.  
* **Estaciones del Año:** Cambios visuales a largo plazo (nieve en invierno, hojas marrones en otoño, floración en primavera).

#### **3.3. Generación Procedural y Aleatoriedad (El Anti-Loop)**

* **Clima y Entorno:** Las nubes, la dirección del viento, el crecimiento de la hierba y la posición de los árboles deben generarse mediante algoritmos de ruido (ej. Perlin Noise) para evitar patrones repetitivos.  
* **La regla de oro:** Matemáticamente, la disposición de elementos, luz y comportamiento en un momento dado debe tener una probabilidad infinitesimal de repetirse exactamente igual en el futuro.

#### **3.4. IA y Comportamiento Autónomo (Máquina de Estados)**

* Los entes (animales, NPCs) no tienen rutas predefinidas. Operan bajo un sistema de Inteligencia Artificial basado en necesidades (Hambre, Sed, Energía, Social).  
* *Ejemplo:* Una vaca pastará aleatoriamente hasta que su variable de "sed" aumente; entonces buscará agua usando un algoritmo de *pathfinding*. Al atardecer, buscará refugio para dormir.

#### **3.5. Mutación y Evolución a Largo Plazo**

* El ecosistema no debe ser estático de mes a mes.  
* **Evolución básica:** Los animales pueden reproducirse (mezclando atributos simples como color o tamaño).  
* **Crecimiento:** Los árboles pequeños plantados el día 1 deben ser grandes al mes 6\. Las estructuras pueden deteriorarse o cambiar sutilmente.

### **4\. Requerimientos Técnicos y Arquitectura (Para evaluar con el equipo)**

* **Motor Gráfico (Sugerencias a debatir):**  
  * *Opción A (Web-First):* **Three.js, Babylon.js o PlayCanvas.** Ideal para venderlo como SaaS (Suscripción B2B) y que corra directo en el navegador de cualquier Smart TV o mini-PC (Raspberry Pi).  
  * *Opción B (App Nativa):* **Unity3D o Godot Engine.** Permite mejores gráficos, físicas más complejas y mayor control de rendimiento. Ideal para instalaciones premium o distribución en tiendas de apps (Steam, Mac App Store).  
* **Estabilidad Extrema (24/7):** El software está diseñado para correr ininterrumpidamente durante meses en monitores comerciales. La gestión de memoria (evitar *memory leaks*) es prioridad absoluta.  
* **Estilo de Arte (A definir):** Se sugiere un estilo *Low-Poly*, *Voxel* o *Stylized/Ghibli*. Evitar el hiperrealismo extremo para mantener los requisitos de hardware bajos y asegurar fluidez en cualquier pantalla estándar.  
* **Audio:** Diseño sonoro dinámico (ruido de fondo, viento, sonido de animales) que también responda proceduralmente a la hora del día y clima.

### **5\. Fases Sugeridas para el Desarrollo (Roadmap)**

1. **Fase 1: Prototipo (Prueba de Concepto \- PoC):** Un escenario pequeño. Ciclo día/noche vinculado al reloj. 2 tipos de animales con IA básica (caminar, comer). Generador de nubes simple.  
2. **Fase 2: Conexión Real & Clima:** Integración de API del clima. Lluvia/nieve procedimental. Crecimiento dinámico de plantas.  
3. **Fase 3: Evolución & Optimización:** Sistema de reproducción/mutación a largo plazo. Optimización extrema para asegurar funcionamiento 24/7 sin crashes.  
4. **Fase 4: Despliegue:** Panel de configuración para el cliente final (para setear la ubicación geográfica de su clínica/local) y lanzamiento.