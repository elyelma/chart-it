# Grafito · Fases del proyecto

Checkpoint del 28 nov 2026. Lo hecho hasta hoy es la **Fase 0: Pre-producción**.

| Fase | Nombre | Estado |
| --- | --- | --- |
| 0 | Pre-producción | ✅ Cerrada (este checkpoint) |
| 1 | Lanzamiento | Siguiente |
| 2 | Compartir | Pendiente |
| 3 | Integraciones (gráficos de Grafito en otros sitios) | Pendiente |
| 4 | Plataforma | Idea |

Reglas que valen en todas las fases:
- Gratis.
- Solo graficar y dibujar: nunca ejecutar operaciones.
- Sin copiar a TradingView.
- Sin rastrear a nadie.
- Publicar en internet solo cuando el dueño lo diga.

---

## Fase 0 · Pre-producción ✅

Del 24 al 28 nov 2026. 14 commits en `elyelma/chart-it`, versión `0.1.0`.

**Gráfico y datos**
- Tres fuentes en vivo, directo desde el navegador y sin servidor propio:
  - **Hyperliquid:** cripto, índices, metales, energía, forex y acciones. Es la fuente por defecto porque funciona también desde EE. UU.
  - **Binance**
  - **Bybit**
- Temporalidades de la fuente y personalizadas (2m, 7H, etc.), con ★ favoritas.
- Volumen dentro del panel de precio, en su propio espacio.
- 22 indicadores con buscador, favoritos y parámetros editables.
- Tipo de gráfico: velas, huecas, barras o línea. Escala normal, logarítmica o porcentaje.
- Punto "en vivo" y reconexión que recupera las velas perdidas tras un corte.

**Dibujo (la promesa: sin límite)**
- 31 herramientas en 9 categorías, con ventana "Dibujos", ★ favoritas y franja inferior.
- Selección con puntos de edición, imán (botón o Ctrl) y alineación con Shift.
- Rectángulo con 6 puntos de edición.
- Ruedita ⚙ por dibujo: niveles propios de Fibonacci, posición en precio o puntos/pips, precios exactos.
- Posiciones de **compra** y **venta** con puntos/pips, % y R:R.
- Menú contextual: duplicar, bloquear, ocultar, orden, borrar.
- Lista de dibujos, deshacer y rehacer.
- Los dibujos de un activo se comparten entre exchanges (BTC en Binance, Bybit y Hyperliquid).

**Datos del usuario**
- Todo se guarda en su navegador: sin cuentas y sin servidor.
- Respaldo para descargar y restaurar, con recordatorio semanal.
- Copia de seguridad automática antes de vaciar una lista de dibujos.

**Producto**
- Nombre **Grafito**, logo del lápiz que dibuja una vela, íconos e imagen para redes.
- App instalable (PWA), versión para celular y atajos de teclado (`?`).
- Página legal corta ("Lo básico"), sin analítica ni cookies.
- Botón "Apoya Grafito ☕" listo, oculto hasta tener la dirección EVM.
- 120 pruebas automáticas y dos rondas de QA (17 bugs corregidos).

---

## Fase 1 · Lanzamiento

**Meta:** que cualquiera pueda abrir Grafito desde un enlace.

1. **Dirección EVM** del dueño en `src/config.ts`, para activar "Apoya Grafito".
2. **Publicar** en Cloudflare Pages (`grafito.pages.dev`, gratis), con subida manual: nada sale publicado sin que el dueño lo diga.
3. Poner esa dirección en la imagen de vista previa (`og:image`).
4. Probar en dispositivos reales:
   - instalar como app en Android e iPhone;
   - Safari;
   - acceso desde EE. UU. con VPN.
5. **Dibujo táctil:** dibujar con el dedo en celular y tablet.
6. **Inglés:** idioma según el navegador. Duplica el público posible.
7. Pendientes chicos del backlog:
   - mostrar cada dibujo solo en ciertas temporalidades;
   - velas Heikin-Ashi;
   - seleccionar varios dibujos a la vez.

**Terminada cuando:** el enlace funciona en celular y computadora, y el dueño lo comparte.

---

## Fase 2 · Compartir

**Meta:** que un gráfico dibujado se pueda mandar a otra persona y ella lo vea igual.

1. **Enlace con dibujos:**
   - los dibujos viajan comprimidos dentro del propio enlace (`#…`), sin servidor;
   - quien lo abre ve el gráfico con esos dibujos y puede copiarlos a los suyos.
2. **Captura + enlace:** el botón de cámara copia la imagen y además el enlace al gráfico en vivo.
3. **Modo solo lectura:** la misma vista sin herramientas, para mostrar.

Esto es la base de la Fase 3: el gráfico que se integra en otro sitio es esta vista de solo lectura.

---

## Fase 3 · Integraciones

**Meta:** que blogs, foros, Discord, Notion y otras plataformas muestren gráficos de Grafito.

1. **Widget para incrustar** (`/embed`): gráfico en vivo dentro de un `<iframe>`.
   - Elige símbolo, temporalidad, tema e indicadores.
   - Puede llevar dibujos (los de la Fase 2).
   - Lleva un pequeño "Grafito" que enlaza a la app.
2. **Configurador:** página donde eliges el gráfico y copias el código para pegarlo.
3. **Vistas previas al pegar el enlace** en Discord, X, Telegram o WhatsApp, con la imagen del gráfico real.
   - Necesita un pequeño Worker de Cloudflare (plan gratuito).
4. **oEmbed:** el estándar que usan WordPress y Notion para convertir un enlace en un gráfico incrustado.
5. Más adelante:
   - un fragmento de JavaScript para desarrolladores (`grafito.js`);
   - un plugin de WordPress.

**Riesgo a vigilar:**
- Si Grafito aparece en sitios de otros, cada visitante pide datos directo al exchange.
- Para Binance y Bybit eso se parece más a "redistribuir" sus datos, algo que sus términos limitan.
- Por eso el widget usará Hyperliquid por defecto.
- Si algún exchange se queja, se cambia la fuente.

---

## Fase 4 · Plataforma (ideas, sin fecha)

- **Índices propios de Grafito:**
  - BTC, ETH, SOL, XRP y HYPE con precio promedio de varios exchanges;
  - un índice "Top 10" y otro de cripto sin BTC.
- Sincronizar dibujos entre dispositivos. Opcional, sin cuenta obligatoria: por ejemplo, con un código.
- Galería pública de gráficos compartidos.
- Más fuentes de datos.

---

## Cómo se marca cada fase

Cada fase cerrada queda con una etiqueta en git (`fase-0`, `fase-1`…). Así siempre se puede volver a ese punto exacto.
