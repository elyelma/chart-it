# Grafito

Gráficos de precios con **dibujos ilimitados**. Abre un gráfico, dibuja todo lo que necesites y vuelve mañana: tus líneas siguen ahí. Sin cuentas, sin límites y rápido.

Grafito sirve **solo para graficar y dibujar**: no ejecuta operaciones, no conecta con cuentas de exchanges y no da recomendaciones de inversión.

## Funciones

- **Dibujo sin límite**: líneas, rayos, horizontales y verticales, canales, tridente de Andrews, Fibonacci (retroceso y extensión), rectángulos, círculos, triángulos, flechas, lápiz libre, rotulador, textos, notas, señales y herramientas de medición (precio, fechas, velas).
- Los dibujos se guardan por símbolo y se ven en **todas las temporalidades**.
- Deshacer / rehacer, imán, bloquear, ocultar, duplicar y estilo por dibujo (color, grosor, línea punteada).
- **Respaldo**: descarga y restaura tus dibujos, listas y favoritos en un archivo `.json`.
- Temporalidades estándar y **personalizadas** (por ejemplo 2m, 7H, 2S), armadas a partir de velas más pequeñas cuando el exchange no las ofrece.
- Tipos de gráfico (velas, velas huecas, barras, línea) y escala normal, logarítmica o porcentual.
- 22 indicadores (volumen dentro del panel de precio, MA, EMA, Bollinger, SAR, RSI, MACD, estocástico, DMI y más) con favoritos y parámetros editables.
- Búsqueda de símbolos (`Ctrl K` o `/`) por ticker, nombre o alias (“oro”, “nasdaq”, “EURUSD”), lista personal con precio y variación 24h, atajos de teclado y captura del gráfico en PNG.
- Interfaz en español.

## Fuentes de datos

Los precios se piden **directamente desde el navegador** a las APIs públicas de los exchanges. No hay servidor intermedio.

| Fuente | Mercados |
| --- | --- |
| Binance | Spot en USDT · perpetuos “TradFi” (oro, divisas, acciones) |
| Bybit | Perpetuos lineales en USDT, incluidos acciones, materias primas y divisas |
| Hyperliquid | Perpetuos cripto · dex `xyz` con índices, metales, energía y divisas |

Los mercados no cripto son **contratos perpetuos que siguen a un subyacente**, no el subyacente en sí. Se etiquetan como tales (por ejemplo, `XYZ100 · Sigue al Nasdaq-100`) y pueden cotizar 24/7.

Grafito no está afiliado a ninguno de estos exchanges. La disponibilidad de cada fuente depende del país y de la red del usuario (por ejemplo, Binance y Bybit restringen el acceso desde Estados Unidos).

## Privacidad

- Sin cuentas ni base de datos propia.
- Dibujos en **IndexedDB** y ajustes en **localStorage**, solo en el navegador del usuario.
- Sin cookies, sin analítica, sin publicidad. La tipografía (Inter) va incluida en el paquete.

Todo en una página corta: [`public/legal/terminos.html`](public/legal/terminos.html).

## Desarrollo local

Requisitos: Node.js `^20.19` o `>=22.12` (requisito de Vite) y npm.

```bash
npm install      # instala dependencias
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # verifica tipos y genera la versión de producción en dist/
npm run preview  # sirve dist/ localmente para probar la build
npm test         # pruebas unitarias (Vitest)
```

## Despliegue en Cloudflare Pages

Grafito es un sitio 100 % estático, así que entra en el plan gratuito.

1. En el panel de Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** y elige este repositorio.
2. Configuración de build:
   - **Framework preset:** Vite (o *None*)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Variable de entorno:** `NODE_VERSION = 22`
3. Cada push a `main` publica a producción; cada rama o pull request recibe una URL de vista previa.
4. Para usar un dominio propio: **Custom domains → Set up a domain**.

## Estructura del proyecto

```
index.html              Estructura de la interfaz
public/                 Archivos servidos tal cual (favicon, páginas legales)
  legal/                Lo básico (uso y privacidad) y licencias de terceros
src/
  main.ts               Arranque: gráfico, cabecera, búsqueda, teclado
  chart/                Dibujos (gestión, persistencia, deshacer), herramientas propias, tema, volumen
  data/                 Un adaptador por exchange (binance, bybit, hyperliquid), catálogo,
                        temporalidades y armado de velas personalizadas
  store/db.ts           Almacén IndexedDB de dibujos
  ui/                   Paneles, menús, lista, búsqueda, ajustes, atajos
tests/                  Pruebas unitarias (Vitest)
docs/LAUNCH.md          Auditoría de lanzamiento y backlog
```

Para añadir una fuente de datos nueva basta con implementar la interfaz `Adapter` de `src/data/types.ts` y registrarla en `src/data/registry.ts`.

## Apoyo

Si `SUPPORT_EVM` en `src/config.ts` tiene una dirección EVM válida, aparece "Apoya Grafito ☕" en Ajustes y en la barra inferior. Vacío, no se muestra nada.

## Tecnología

TypeScript + Vite, [KLineChart](https://github.com/klinecharts/KLineChart) (Apache 2.0) para el motor de gráficos e [Inter](https://github.com/rsms/inter) (SIL OFL 1.1) como tipografía. Avisos completos en [`public/legal/licencias-terceros.txt`](public/legal/licencias-terceros.txt).

## Licencia

Grafito es freeware: usarlo es gratis. El código no tiene licencia abierta. Mientras no se publique un archivo `LICENSE`, todos los derechos quedan reservados por el titular y este repositorio no concede permiso para copiar, modificar ni redistribuir el código.
