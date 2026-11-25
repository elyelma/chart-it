# Chart-It · Lo que se hizo esta noche (25 nov 2026)

Trabajé de forma autónoma con un pequeño equipo de agentes:

- **Desarrollo (yo):** construí todo lo de abajo y lo verifiqué en el navegador.
- **QA / Tester (2 rondas):** creó 57 pruebas automáticas y encontró bugs reales; todos los confirmados están corregidos.
- **Producto / Lanzamiento:** escribió `docs/LAUNCH.md` (auditoría de lanzamiento), `README.md` y los borradores legales en `public/legal/`.

Todo está en GitHub (`elyelma/chart-it`, rama `main`), en commits separados por tema. **No publiqué nada en internet**: la salida al público la decides tú.

---

## 1. Lo que pediste

- **Volumen** dentro del panel principal, abajo, con su propia escala, sin pisar las velas y sin medias móviles.
- **Botón "Dibujos"** junto a "Indicadores", con la ventana de categorías y las estrellas ★.
- **Diseño más fino:**
  - tipografía Inter;
  - superficies y bordes finos;
  - temporalidades tipo control segmentado;
  - menús con animación suave;
  - acento violeta solo donde importa;
  - textos del gráfico con la misma tipografía (antes salían con una fuente con serifas, se veía tosco).

## 2. Funciones nuevas

| Dónde | Qué |
| --- | --- |
| ⚙ Ajustes | Tipo de gráfico (velas, huecas, barras, línea) · escala normal / logarítmica / porcentaje · **respaldo** (descargar y restaurar dibujos, listas y favoritos) · estado del almacenamiento · atajos · enlaces legales |
| Clic derecho sobre un dibujo | Duplicar (Ctrl D), bloquear, ocultar, traer al frente / enviar atrás, borrar |
| Barra de estilo | Color personalizado, tamaño de texto, X para ocultarla |
| Indicadores | 22 indicadores, buscador, ★ favoritos, parámetros editables (ej. RSI 14) |
| Dibujos | **Posición riesgo/beneficio** (Q): entrada, objetivo, stop, % y R:R |
| Barra inferior | **Lista de dibujos** del símbolo: ir a cada uno, ocultar, bloquear, borrar |
| Herramientas | Cada herramienta recuerda el último estilo que le diste |
| Mismo activo | **Tus dibujos de BTC se ven en BTC de Binance, Bybit y Hyperliquid** (y el oro como GOLD/XAU). Interruptor en Ajustes, activado por defecto; tus dibujos actuales se copian la primera vez y la copia original queda intacta |
| Precio | Punto **En vivo** (verde) / reconectando (ámbar) / sin conexión (rojo). Tras un corte, recarga las velas que faltaron |
| Captura PNG | Pie con marca Chart-It, símbolo, temporalidad, fuente y fecha (sirve de publicidad al compartir) |
| Primer uso | Tarjeta de bienvenida con lo esencial (aparece una sola vez) |
| Celular | Barra superior en dos filas y paneles a lo ancho |
| App instalable | Manifest, íconos y service worker (se puede "instalar" como app) |
| Compartir | Imagen de vista previa (`og.png`) y etiquetas para redes |

## 3. Robustez (para que no falle frente a usuarios reales)

- **Mercado por defecto:** ahora es **Hyperliquid BTC**. Binance y Bybit bloquean las IP de EE. UU.; un visitante de allí habría visto un error al entrar.
- **Fuente caída o bloqueada:** si un exchange no responde, la app no muestra errores rojos. Explica el motivo y ofrece el mismo activo en otra fuente (ej. BTC en Hyperliquid o Bybit).
- **Enlaces compartidos** (`#hl:xyz:GOLD/4h`): ahora abren el mercado correcto también en la primera visita.
- **Dibujos más seguros:**
  - se guardan al cerrar o cambiar de pestaña;
  - cada escritura se confirma;
  - si el navegador no deja guardar, aparece un aviso;
  - un recordatorio semanal sugiere hacer respaldo, con nota especial para Safari, que borra los datos tras 7 días sin entrar.
- **Fechas:** las velas diarias, semanales y mensuales se muestran en UTC. En México se veían con la fecha del día anterior.
- **Temporalidades armadas:** ya no usan velas de 3D de Binance ni las semanas de Hyperliquid (que empiezan en jueves) ni sus "meses" de 30 días. Ahora se arman desde velas diarias.
- **Datos guardados corruptos** o enlaces mal formados ya no dejan la app en blanco.
- **CSP:** política de seguridad estricta para Cloudflare (`public/_headers`), probada con la versión de producción.

## 4. Lo que necesito de ti antes de lanzar

Detalle completo en `docs/LAUNCH.md`. ⚖️ = conviene un abogado.

1. ⚖️ **Postura sobre datos de exchanges:**
   - Binance y Bybit restringen el uso comercial de sus datos. Recomendación: lanzar gratis, sin anuncios ni servidor intermedio.
   - Escribir a Binance y Bybit pidiendo permiso.
   - Hyperliquid es la fuente más segura.
2. ⚖️ **Nombre:** "Chart It" ya lo usan otros productos de software (chartit.io y otros). Hay que hacer la búsqueda de marca **antes** de comprar dominio.
3. **Dominio:** cuando lo tengas, pon la URL absoluta en `og:image` (`index.html`).
4. **Textos legales:** completar `[nombre del titular]`, `[correo de contacto]` y la jurisdicción en `public/legal/terminos.html` y `privacidad.html`.
5. **Contacto para comentarios:** pon un correo o formulario en `src/config.ts` (`FEEDBACK_URL`) y aparecerá en Ajustes.
6. **Desde una VPN de EE. UU.:** confirmar que Hyperliquid responde.
7. **Licencia del repositorio:** no hay ninguna elegida. Si piensas venderlo, mantenlo privado.

## 5. Cómo publicarlo (cuando decidas)

En Cloudflare Pages:
1. Conecta el repositorio de GitHub.
2. Comando de build: `npm run build`.
3. Carpeta de salida: `dist`.

`public/_headers` ya trae la seguridad y la caché. Costo: solo el dominio (unos USD 10–20 al año).

## 6. Cómo probar en local

Cada comando, en `E:\Claude Code Projects\Chart-It`:

```powershell
npm install
```
```powershell
npm run dev
```
```powershell
npm test
```

## 7. Lo que no pude verificar

- El **service worker** no se puede registrar en el navegador integrado de esta app. El código es estándar, pero hay que probar la instalación en Chrome, Android e iOS reales.
- No pude probar desde **EE. UU.** (VPN), ni **Safari** real, ni **dibujo táctil** en celular. El celular se ve bien, pero dibujar con el dedo es otra cosa (está en el backlog v1.1).

## 8. Siguiente (backlog v1.1, de `docs/LAUNCH.md`)

- Niveles de Fibonacci configurables.
- Visibilidad por temporalidad.
- Inglés.
- Dibujo táctil.
