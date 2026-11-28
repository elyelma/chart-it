# Chart-It · Auditoría de lanzamiento (v1)

> **Nota (27 nov 2026):** el producto ahora se llama **Grafito**. Este documento es histórico: lo que dice de "Chart-It" aplica a Grafito.


_Producto / Lanzamiento · 25 de noviembre de 2026 · basado en el código de `main` (commit `e8fb4ec`) más los cambios sin commit que el desarrollador tenía en curso ese día._

> **Aviso:** este documento no es asesoría legal. Todo lo marcado con ⚖️ debe revisarlo un abogado antes de lanzar o de vender el producto.

---

## 0. Resumen

Chart-It ya cumple su promesa central: **abrir un gráfico y dibujar sin límite, rápido, sin cuenta**. El producto es sólido para un v1 en escritorio. Lo que falta para lanzar **no es tanto el producto como lo que lo rodea**:

1. **Riesgo de datos:** los términos de Binance y Bybit restringen el uso comercial de sus APIs y datos. Para un sitio gratis y sin publicidad el riesgo es bajo pero no nulo, y **pesa mucho si después se quiere vender o monetizar**.
2. **Geobloqueo:** Binance y Bybit bloquean Estados Unidos. Hoy, un visitante de EE. UU. (gran parte del público que se queja del límite de dibujos) abre la app y ve un error en el mercado por defecto (`BTCUSDT` de Binance).
3. **Durabilidad de los dibujos:** viven solo en el navegador. Safari puede borrarlos tras 7 días sin visitas. Para un producto cuya promesa son los dibujos, esto es crítico.
4. **Legal y marca:** faltan el aviso visible de “no es asesoría”, la revisión de términos y privacidad (ya hay borradores), los avisos de licencias de terceros enlazados en la app y una búsqueda de marca para “Chart-It” antes de comprar el dominio.

Costo estimado del primer año, sin abogado: **USD 10–20** (solo el dominio). Con revisión legal y búsqueda de marca, el rango sube a **USD 300–1.500+** según el país.

---

## 1. Qué está listo

Verificado leyendo `src/`, `index.html` y `public/`.

**Dibujo (el núcleo)**
- Unas 30 herramientas: líneas, rayos, horizontales y verticales, marca de precio, canal paralelo, canal de precio, tridente de Andrews, retroceso y extensión de Fibonacci, rectángulo, círculo, triángulo, flecha, cruz, lápiz libre, rotulador, texto, nota con flecha, señales arriba/abajo, medir, rango de precio y rango de fechas (`src/chart/overlays.ts`).
- **Sin límite real:** contador visible “N dibujos · sin límite” en la barra.
- Persistencia por mercado en IndexedDB, compartida entre temporalidades, con guardado diferido (`src/chart/drawings.ts`, `src/store/db.ts`). Se pide `navigator.storage.persist()`.
- Deshacer/rehacer (200 pasos), imán, modo “seguir dibujando”, ocultar todo, borrar todo, bloquear, editar texto, estilo por dibujo (7 colores, 4 grosores, punteado).
- Barra inferior con herramientas favoritas configurables y una paleta completa por categorías con buscador.
- Atajos de teclado por herramienta (T, R, H, F, G…), `Ctrl Z / Ctrl Y`, `Supr`, `Esc`, `Ctrl K` y `/`.
- El clic derecho selecciona y no borra por accidente (buena decisión).

**Gráfico y datos**
- Tres fuentes detrás de una interfaz `Adapter` limpia: Binance spot USDT, Binance perpetuos TradFi, Bybit perpetuos lineales USDT y Hyperliquid (dex principal + `xyz`).
- Si una fuente falla, las demás siguen funcionando (`Promise.allSettled`), y el catálogo se guarda 6 h en caché.
- Velas en vivo por WebSocket con reconexión exponencial.
- Temporalidades estándar y **personalizadas** (2m, 7H, 2S…) armadas a partir de velas base, con favoritas.
- Etiquetado honesto de los perpetuos (“XYZ100 · Sigue al Nasdaq-100”, “perpetuo 24/7” con explicación al pasar el mouse).
- Búsqueda por ticker, nombre o alias en español (“oro”, “petróleo”, “nasdaq”), con filtros por categoría.
- Lista personal con precio y variación 24 h (se actualiza cada 10 s y solo con la pestaña visible).
- Indicadores (volumen, MA, EMA, BOLL, SAR, RSI, MACD, KDJ, OBV, CCI, WR, DMI).
- Captura PNG, enlace profundo `#mercado/temporalidad`, zona horaria local y formato `es-MX`.

**En curso (cambios sin commit del desarrollador al 25-11)**
- Menú **Ajustes**: tipo de gráfico (velas, huecas, barras, línea), escala normal/logarítmica/porcentual, **respaldo y restauración** en `.json`, atajos de teclado, enlaces a Términos y Privacidad y versión.
- **Menú contextual** del dibujo: duplicar (`Ctrl D`), bloquear, ocultar, traer al frente, enviar atrás y borrar.
- **Color personalizado** (selector libre) y parámetros editables de indicadores.
- Pruebas unitarias con Vitest (`tests/`).

**Calidad técnica**
- Sitio 100 % estático (Vite + TypeScript, unos 300 KB de JS sin comprimir). Encaja perfecto en el plan gratuito de Cloudflare Pages.
- La tipografía Inter va incluida en el paquete: no hay llamadas a Google Fonts.
- No usa cookies ni analítica de terceros.

---

## 2. Bloqueantes para un v1 público (ordenados)

### B1. Decidir y documentar la postura sobre los términos de datos de los exchanges ⚖️
**Por qué importa:** es el único riesgo que puede **apagar el producto de un día para otro** o arruinar una venta futura. Binance limita la licencia de su propiedad intelectual a uso “non-commercial personal or internal business use” (términos vigentes, cl. 22), y, según una copia archivada de 2023 citada por un tercero, sus términos globales prohibían expresamente webs o apps que se beneficien de sus datos de mercado. El acuerdo de API de Bybit prohíbe “repackage or resell… Service Data” (6.7), “commercially exploit the APIs” (6.9) y **replicar sus productos o “compete with or replace the user experience”** (6.5). Ver §4.1.
**Propuesta:**
- Lanzar **gratis, sin publicidad, sin plan de pago y sin servidor que retransmita datos**. Es la postura más defendible: es el navegador del usuario quien consulta la API pública y la app no revende nada.
- Poner una **atribución visible** de la fuente en el gráfico (“Datos: Binance”) y en los términos aclarar que no hay afiliación.
- **Antes de lanzar**, escribir a Binance (`business@binance.com` o el canal de partners que indique su web) y a Bybit (equipo de partnerships o API) describiendo el uso exacto y pidiendo permiso por escrito. Guardar las respuestas. El silencio no es permiso, pero documenta buena fe.
- Mantener **Hyperliquid como fuente principal**: sus datos son públicos y on-chain, y sus términos regulan su interfaz web, no el uso de datos del protocolo (ver §4.1).
- **No monetizar** (anuncios, suscripción ni venta) sin una opinión legal escrita y, idealmente, sin el permiso de cada exchange.

### B2. Que la app funcione cuando una fuente está bloqueada (EE. UU. y otros)
**Por qué importa:** Binance responde 451 y Bybit 403 a IP de EE. UU. El mercado por defecto es `bn:BTCUSDT`. Un visitante de EE. UU. llegado desde Reddit ve “No se pudieron cargar los datos” y un toast de error de catálogo en su **primer segundo** de uso. Ese es el peor primer impacto posible.
**Propuesta:**
- Al arrancar, si una fuente falla, ocultarla del buscador y de la lista **sin mostrar un error rojo**. Basta un aviso discreto en el buscador: “Binance no está disponible desde tu red”.
- Si el mercado guardado o el por defecto no carga, pasar automáticamente a `hl:BTC` (Hyperliquid) y avisarlo con una línea.
- Cambiar el **mercado por defecto a Hyperliquid BTC**, o elegirlo según qué fuentes respondan primero.
- **Probar desde una IP de EE. UU.** (VPN) y desde Europa antes de lanzar. Hyperliquid restringe su *interfaz* a personas de EE. UU. y Ontario; hay que confirmar que su API pública sí responde desde ahí. Si no, la app no sirve en EE. UU. y el anuncio debe enfocarse en otros países.
- Evaluar el dominio solo de datos de Binance (`data-api.binance.vision`), que Binance documenta para datos públicos, por si se comporta distinto.

### B3. Proteger los dibujos contra pérdidas
**Por qué importa:** la promesa es “dibuja sin límite y tus dibujos siguen ahí”. Pero:
- En **Safari** (iPhone, iPad y Mac), WebKit borra IndexedDB y localStorage de un sitio tras **7 días de uso de Safari sin visitarlo** (ITP). Las apps añadidas a la pantalla de inicio tienen su propio contador. `persist()` en Safari se concede sobre todo a esas apps.
- Si el usuario borra datos de navegación, usa modo incógnito o cambia de equipo, pierde todo, y no hay copia en servidor.
**Propuesta:**
- Terminar y lanzar el **respaldo** que ya está en curso. Es imprescindible para el v1.
- **Recordatorio de respaldo** no intrusivo: al llegar a unos 25 dibujos y luego cada 7 días con cambios, mostrar “¿Descargas un respaldo? 1 clic”.
- Detectar Safari y mostrar una vez: “Safari puede borrar tus dibujos si no entras en 7 días. Instálalo en la pantalla de inicio o haz respaldos”.
- Si `persist()` devuelve `false`, mostrarlo en Ajustes (“Almacenamiento no protegido”).
- Llevar el manifest de PWA al v1 o al v1.1 (ver backlog): ayuda directamente a la persistencia.

### B4. Aviso visible de “no es asesoría” y fuente de datos, y páginas legales revisadas ⚖️
**Por qué importa:** hoy no hay ningún aviso en la interfaz. Los enlaces a Términos y Privacidad solo aparecen dentro de Ajustes (en curso), y esas páginas no existían. Mostrar precios de derivados sin aviso expone al titular a reclamos.
**Propuesta:**
- Una línea fija y discreta al pie del gráfico o en el estado vacío: “Solo información, no es asesoría de inversión · Datos de {fuente}, pueden tener errores o retrasos · Términos · Privacidad”.
- Usar los borradores ya creados en `public/legal/terminos.html` y `public/legal/privacidad.html`: completar los marcadores (`[nombre del titular]`, `[correo de contacto]`, jurisdicción, fecha) y **pasarlos por un abogado**.
- Agregar en Términos el aviso de marcas de índices (ya incluido: Nasdaq-100 y S&P 500 son de sus titulares).

### B5. Búsqueda de marca y elección del dominio antes de anunciar ⚖️
**Por qué importa:** cambiar de nombre después de lanzar es caro (dominio, enlaces, comunidad). “Chart It” ya lo usan varios productos de software: una herramienta web para crear y compartir gráficos (chartit.io, en Product Hunt), una app de scouting de sóftbol (chartIT, de Diamond Scouting), una herramienta accesible de diagramas (Nathan Tech) y el paquete open source `django-chartit`. Además existe la marca registrada **CHARTIQ** (USPTO Reg. 5483997, clase 9, software financiero, hoy de S&P Global), con quien comparte el prefijo “Chart” y el sector. Por último, “chart it” es casi descriptivo, lo que dificulta registrarlo y defenderlo.
**Propuesta:**
- Hacer una búsqueda en USPTO, en WIPO Global Brand Database y en la oficina del país del titular (por ejemplo, IMPI si es México), en las clases 9 y 42.
- Pedir a un abogado de marcas una opinión de “libertad de uso” (*clearance*). El riesgo frente a ChartIQ parece moderado-bajo (marcas distintas, mercados distintos), pero la coincidencia con “Chart It” en software es alta.
- Si se piensa vender el producto, un nombre **distintivo y registrable** aumenta su valor. Conviene decidirlo **antes** de comprar el dominio y anunciar.

### B6. Cumplir las licencias de terceros
**Por qué importa:** KLineChart es Apache 2.0 e incluye un archivo `NOTICE` (con avisos propios y de código derivado de otra biblioteca). La sección 4(d) de Apache 2.0 obliga a redistribuir ese NOTICE y una copia de la licencia. Inter es OFL 1.1, que también pide incluir la licencia. Hoy la build no incluye nada de esto.
**Propuesta:** ya se creó `public/legal/licencias-terceros.txt` con NOTICE y licencias íntegras. Falta **enlazarlo** desde Ajustes o el pie (ya está enlazado desde los Términos). El aviso nombra a terceros porque la licencia lo exige. Se publica tal cual y no forma parte de la marca ni de la interfaz. Regenerarlo al actualizar dependencias.

### B7. Configuración de producción y vista previa al compartir
**Por qué importa:** el lanzamiento será por enlaces en Reddit, X y Telegram. Una mala vista previa o una CSP que bloquee algo se nota el primer día.
**Estado:** el desarrollador ya está agregando, sin commit al cierre de esta auditoría, `public/_headers` (CSP, HSTS, caché inmutable de `/assets/*`), metadatos OG/Twitter, `og.png`, íconos, `manifest.webmanifest` y `sw.js`. Antes de lanzar hay que verificar:
- **`og:image` y `twitter:image` con URL absoluta** (`https://dominio/og.png`). Varios rastreadores (Facebook, LinkedIn, algunos bots de Telegram) no resuelven rutas relativas.
- **La CSP bloquea Cloudflare Web Analytics.** `script-src 'self'` y `connect-src` no incluyen `https://static.cloudflareinsights.com` ni `https://cloudflareinsights.com`. Si se activa la analítica, hay que añadirlos o no habrá datos.
- Si se pasa a `data-api.binance.vision` u otro dominio (B2), hay que añadirlo a `connect-src`.
- En `og:description` dice “en tiempo real”. Es correcto en la mayoría de los casos, pero conviene “en vivo” y no prometer exactitud (ver B4).
- `sw.js`: confirmar que un deploy nuevo se activa sin dejar a usuarios con una versión vieja en caché, y que el service worker no cachea respuestas de los exchanges.
- Página 404 sencilla.

### B8. Canal de feedback dentro de la app y medición mínima
**Por qué importa:** sin feedback ni métricas no hay forma de saber si el lanzamiento funcionó ni qué arreglar primero. Hoy no hay ningún enlace de contacto.
**Propuesta:** enlace “Enviar comentarios” en Ajustes, apuntando a un correo del dominio (Cloudflare Email Routing, gratis) o a un formulario simple. Activar **Cloudflare Web Analytics** (gratis y sin cookies, según Cloudflare). Ver §6.

---

## 3. Para poco después del lanzamiento (2–6 semanas)

1. **Uso en celular y tablet.** Mucho tráfico de Reddit es móvil. Hoy hay CSS responsivo básico (≤640 px), pero dibujar con el dedo, la barra inferior y los paneles no están probados en pantalla táctil. Para el v1, al menos verificar que **ver** gráficos funciona y avisar “Para dibujar, mejor en computadora”. En v1.1, dibujo táctil de verdad.
2. **Interfaz en inglés.** El público más grande que se queja de los límites escribe en inglés. Sin inglés, el anuncio en r/TradingView o r/Daytrading pierde la mayor parte del efecto. Conviene preparar i18n (es/en) y lanzar en dos fases: primero LatAm/España y luego inglés.
3. **PWA instalable** (manifest, íconos y service worker ya en curso). Mejora la persistencia en Safari y da sensación de “app”. Falta probarla y explicar cómo instalarla.
4. **Dibujos “huérfanos”.** Si un mercado desaparece del catálogo (deslistado o fuente bloqueada), sus dibujos siguen en IndexedDB pero no se pueden ver. Hay que listarlos en Ajustes o en el respaldo.
5. **Monitoreo de fallas de fuentes.** Registrar, sin datos personales, qué fuente falló y con qué código (451, 403, 429). Podría ser con Cloudflare Web Analytics y eventos personalizados, o una métrica simple. Así se detecta pronto si un exchange empieza a bloquear.
6. **Uso de rate limits.** Hoy la lista pide `/fapi/v1/ticker/24hr` (todos los símbolos) y `metaAndAssetCtxs` de Hyperliquid cada 10 s. Como cada usuario consume su propia cuota por IP, está lejos de los límites. Aun así, conviene tratar 429 y 418 con espera (`Retry-After`) y no reintentar en bucle. Binance banea IPs de 2 minutos a 3 días si no se respeta el 429.
7. **Onboarding de 20 segundos** (ver backlog).
8. **Elegir licencia del código** (ver §4.6).

---

## 4. Riesgos

### 4.1 Términos de uso de datos por exchange ⚖️

| Exchange | Qué dicen los términos (verificado 25-11-2026) | Lectura para Chart-It | Riesgo |
| --- | --- | --- | --- |
| **Binance** | Términos de Uso (versión NZ, actualizada el 17-08-2026): licencia de la propiedad intelectual de Binance “solely… for non-commercial personal or internal business use” (cl. 22); prohíbe usar los servicios “for resale or commercial purposes” sin acuerdo escrito (cl. 26.1.c); prohíbe copiar, transmitir, difundir o crear obras derivadas de la PI de Binance (26.1.k) y usar bots o scrapers fuera de lo “purposely provided” (26.1.h). Según CryptoMarkets.tools, que cita una copia archivada de febrero de 2023, los términos globales prohibían expresamente, sin consentimiento escrito, servicios de datos y webs o apps que cobren o se beneficien de los datos de mercado, **incluso con publicidad**. Los datasets de `data.binance.vision` están bajo CC BY-NC-SA 4.0 (no comercial). La documentación oficial ofrece endpoints públicos sin API key (`data-api.binance.vision`). | Estos términos se dirigen a quien abre una cuenta, y no hay una política específica para la API pública de mercado. En el foro de desarrolladores de Binance, un usuario (no Binance) opinó que el uso gratuito con respeto a los límites es tolerado. Una app **gratuita, sin anuncios y sin retransmisión** es defendible. Cualquier monetización o venta **necesita permiso escrito**. | **Medio**, **alto** si se monetiza |
| **Bybit** | API Terms & Conditions (PDF de Bybit): aplica a quien “use our Application Programming Interface”. 6.5: no “replicate products or services offered by us… or attempt to compete with or replace the user experience”. 6.7: no “repackage or resell the services… API or Service Data”. 6.9: no “commercially exploit the APIs”. 10.1: pueden suspender el acceso “for any reason whatsoever without prior notice”. La documentación de la API indica que las IP de EE. UU. y China continental reciben 403. | Es el acuerdo más restrictivo. Es ambiguo si aplica a quien llama endpoints públicos sin clave. La cláusula 6.5 de “no competir con la experiencia de usuario” podría alegarse contra una app de gráficos. | **Medio-alto** |
| **Hyperliquid** | Los Términos de Uso (app.hyperliquid.xyz/terms, actualizados el 15-06-2026, de Hyperliquid Corp.) regulan la **interfaz web**. Restringen a “Restricted Persons” (según resúmenes de terceros: EE. UU., Ontario y territorios sancionados, cl. 1.6). La API `info` es pública y sin clave; los datos son del L1 on-chain. Los límites están documentados (1200 de peso por minuto por IP, 10 WebSockets por IP). | La fuente más limpia para mostrar datos. El dex `xyz` lo despliega un tercero (HIP-3), así que sus contratos y nombres (XYZ100) son de ese desplegador. | **Bajo** (vigilar EE. UU.) |

**No se usa y no conviene usar:** OKX y Coinbase prohíben expresamente mostrar sus datos a terceros o crear apps para usuarios finales sin licencia (según el resumen de CryptoMarkets.tools y las Market Data Terms de Coinbase). Tenerlo en cuenta antes de añadir fuentes.

**Recomendaciones:**
1. Pedir permiso escrito a Binance y Bybit (B1).
2. Mantener la arquitectura navegador → exchange. **No crear un proxy o Worker que retransmita datos:** convertiría a Chart-It en redistribuidor (peor legalmente) y concentraría las peticiones en IP de Cloudflare, que Bybit suele bloquear.
3. Diseñar para poder **quitar una fuente en un día** (la interfaz `Adapter` ya lo permite) y tener a Hyperliquid como respaldo de los mercados principales.
4. Para una futura venta: los compradores harán *due diligence* sobre esto. Un acuerdo de datos con licencia (proveedor comercial o permiso escrito) aumenta el valor. Depender de APIs gratuitas sin permiso lo reduce.

### 4.2 Marcas ⚖️
- **Nombre “Chart-It”:** ver B5. Riesgo de confusión con productos de software que ya usan “Chart It” y debilidad descriptiva. CHARTIQ es una marca registrada en el mismo sector.
- **Nombres de índices:** “Nasdaq-100” y “S&P 500” son marcas. Usarlos para describir lo que sigue un contrato (“Sigue al Nasdaq-100”) es un uso descriptivo razonable, siempre con aviso de no afiliación (ya está en Términos). **Nunca** rotular un mercado como “NASDAQ” o “S&P 500” a secas, ni usar sus logotipos. El código ya lo respeta. Ojo: los alias de búsqueda (`NASDAQ`, `US100`, `SPX500`) no se muestran como nombre, así que están bien.
- **Exchanges:** usar sus nombres solo como atribución de la fuente, sin logotipos.
- **TradingView:** no nombrarlo en la interfaz, el dominio, los anuncios ni el material del producto. El aviso de licencias de KLineChart menciona a un tercero porque la licencia lo exige. Es correcto y no forma parte de la marca.

### 4.3 Avisos (disclaimers)
Hace falta un aviso visible permanente (B4) y en Términos. Puntos mínimos: solo información, sin asesoría, datos de terceros “tal cual” y que pueden estar retrasados o equivocados, perpetuo ≠ subyacente, sin afiliación con exchanges ni índices, y alto riesgo de los derivados. Ya están en el borrador de Términos.

### 4.4 Privacidad ⚖️
- La postura es muy fuerte: sin cuentas, sin servidor y sin cookies. Es un argumento de marketing.
- Matices que el aviso de privacidad ya declara: el navegador del usuario se conecta directamente con Binance, Bybit y Hyperliquid, que reciben su IP; Cloudflare sirve el sitio y recibe IP y registros técnicos; los correos de feedback son datos personales.
- Si se activa la analítica de Cloudflare: según Cloudflare no usa cookies ni almacenamiento local, pero una revisión independiente (ctrl.blog) detectó una cookie en el pasado. **Verificar en el navegador** antes de afirmar “sin cookies” y ajustar el texto.
- Según el país del titular y de los usuarios pueden aplicar LFPDPPP (México), Ley 1581 (Colombia), Ley 25.326 (Argentina), LGPD (Brasil) o el RGPD (UE). Con este diseño el cumplimiento es sencillo, pero un abogado debe confirmar los requisitos formales (identificación del responsable, medios para ejercer derechos).

### 4.5 Límites de las APIs y dependencia de CORS
- **Todo depende de que los exchanges sigan permitiendo peticiones desde navegadores (CORS abierto).** Si un exchange empieza a filtrar por `Origin` o cierra CORS, esa fuente deja de funcionar **para todos los usuarios a la vez**, sin aviso. Mitigaciones: varias fuentes (ya las hay), degradación silenciosa (B2), monitoreo (§3.5) y la comunicación preparada (“X no está disponible por ahora”).
- **Límites por IP del usuario** (no del sitio), lo que escala bien con usuarios distribuidos:
  - Binance: peso por IP. 429 → hay que esperar; insistir → baneo 418 de 2 min a 3 días.
  - Bybit: 600 peticiones cada 5 s por IP; si se excede, 403 y espera mínima de 10 min.
  - Hyperliquid: 1200 de peso por minuto por IP (`candleSnapshot` cuesta 20 + extra por cada 60 velas) y **máximo 10 WebSockets por IP**. Con muchas pestañas abiertas, o en redes compartidas (oficinas, universidades, CGNAT móvil), se puede llegar al límite.
- Temporalidades personalizadas: hasta 5 páginas de velas base por carga. Es razonable, pero hay que vigilarlo si se agregan cargas masivas.

### 4.6 Geobloqueo
- **EE. UU.:** Binance (451) y Bybit (403, documentado por Bybit para EE. UU. y China continental) no funcionan. Hyperliquid restringe su interfaz a personas de EE. UU. y Ontario; hay que verificar el comportamiento de la API. Además, Bybit bloquea rangos de IP de nubes, lo que afecta a VPN y redes corporativas.
- **Otros países:** las restricciones cambian a menudo (bloqueos de ISP, sanciones). La app debe degradar con elegancia (B2).
- **Postura legal:** Chart-It no debe sugerir usar VPN para saltarse bloqueos. Sí puede decir que “la disponibilidad depende de tu país” (ya está en Términos).

### 4.7 Licencia del código y venta futura
- El repositorio no tiene licencia. Eso equivale a “todos los derechos reservados”, que es lo más conveniente si se quiere vender. Si el repositorio de GitHub es público, cualquiera puede verlo y clonarlo, aunque no tenga permiso legal para reutilizarlo. **Recomendación:** mantenerlo **privado** hasta decidir. Si se quiere abrir, elegir conscientemente (por ejemplo, AGPL o una licencia “source-available”) con consejo legal.
- Las dependencias (Apache 2.0, OFL) permiten el uso comercial y la venta, siempre que se respeten los avisos (B6).

---

## 5. Costos estimados (primer año)

| Concepto | Costo | Nota |
| --- | --- | --- |
| Hosting en Cloudflare Pages (plan Free) | USD 0 | Peticiones y ancho de banda estáticos ilimitados; 500 builds al mes; 100 dominios por proyecto. |
| Dominio `.com` en Cloudflare Registrar | ~USD 10–11/año | Precio al costo, sin margen. `.app` o `.io` cuestan más (~USD 15–50). |
| Correo de contacto | USD 0 | Cloudflare Email Routing reenvía a un Gmail personal (solo recepción). |
| Analítica | USD 0 | Cloudflare Web Analytics. |
| Feedback | USD 0 | Correo, o GitHub Discussions si el repositorio es público. |
| **Total técnico** | **~USD 10–20/año** | |
| Búsqueda de marca (bases públicas) | USD 0 | USPTO, WIPO Global Brand DB, IMPI, etc. |
| Revisión legal de Términos, Privacidad y opinión sobre datos y marca | ~USD 300–1.500+ | Estimación muy variable según el país y el despacho. |
| Registro de marca (opcional) | USPTO desde USD 350 por clase; en LatAm varía por país | Solo si el nombre pasa la búsqueda. |

---

## 6. Checklist de lanzamiento

### Antes del lanzamiento
- [ ] **Nombre:** búsqueda de marca (USPTO, WIPO y la oficina local) en las clases 9 y 42. Decisión: mantener “Chart-It” o cambiarlo. ⚖️
- [ ] **Dominio:** comprarlo en Cloudflare Registrar (Dashboard → Domain Registration → Register). Activar renovación automática y bloqueo de transferencia.
- [ ] **Permisos de datos:** enviar correos a Binance y Bybit (B1) y archivar las respuestas.
- [ ] **Legal:** completar los marcadores de `terminos.html` y `privacidad.html`, revisarlos con un abogado y publicarlos. ⚖️
- [ ] **App:** aviso visible de “no es asesoría” y fuente (B4), enlace a licencias de terceros (B6), enlace de feedback (B8).
- [ ] **App:** degradación cuando una fuente falla y mercado por defecto en Hyperliquid (B2).
- [ ] **App:** respaldo, recordatorio de respaldo y aviso para Safari (B3).
- [ ] **App:** cerrar B7: URL absoluta en `og:image`, CSP compatible con la analítica, revisar el service worker y añadir la 404.
- [ ] **Pruebas manuales:** Chrome, Firefox, Safari y Edge; Windows y Mac; un celular Android y un iPhone (al menos para ver gráficos); IP de EE. UU. y de Europa por VPN; modo incógnito; restaurar un respaldo en otro navegador.
- [ ] `npm run build` y `npm test` en verde. Cerrar el commit del trabajo en curso.

### Despliegue en Cloudflare Pages desde GitHub
1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** → autorizar GitHub (solo el repositorio `chart-it`).
2. Rama de producción: `main`. Build command: `npm run build`. Output: `dist`. Variable `NODE_VERSION=22`.
3. Primer deploy → probar la URL `*.pages.dev`.
4. **Custom domains** → añadir `dominio.com` y `www.dominio.com` (redirigir `www` al dominio raíz con una Redirect Rule).
5. Proyecto de Pages → **Metrics → Web Analytics → Enable** (inserta el script automáticamente). Verificar en DevTools que no aparezcan cookies, y si aparecen, ajustar el aviso de privacidad.
6. **Email Routing** del dominio → `hola@dominio.com` → correo personal. Ponerlo como `[correo de contacto]`.
7. Las vistas previas por rama quedan activas; usarlas para probar antes de fusionar a `main`.

### Lanzamiento (semana 1)
- **Fase 1, comunidades hispanohablantes** (la interfaz está en español):
  - Reddit: subreddits de finanzas y cripto por país (por ejemplo r/BitcoinMexico, r/mexicofinanciero, r/merval). Leer las reglas de autopromoción de cada uno antes de publicar; varios solo la permiten en hilos semanales.
  - Grupos de Telegram y Discord de trading en LatAm (con permiso de los moderadores).
  - X en español: hilo corto con un GIF de 15 s dibujando 50 líneas.
- **Fase 2, en inglés** (cuando exista la interfaz en inglés):
  - r/TradingView, r/Daytrading, r/Forex, r/CryptoMarkets, r/SideProject, “Show HN” en Hacker News y Product Hunt.
  - X: responder de forma útil y no repetitiva en conversaciones donde se quejan del límite de dibujos (por ejemplo, las que reportan el límite de 30 dibujos por gráfico del plan básico).
- **Mensaje:** “Gráficos gratis con dibujos ilimitados. Sin cuenta: tus dibujos quedan en tu navegador.” Mostrar, no comparar: no usar el nombre ni el logo de la competencia en el material del producto.
- **Qué no hacer:** publicar el mismo mensaje en muchos subreddits el mismo día, comprar votos o prometer funciones de trading o señales.
- **Medir:** visitas únicas, porcentaje que crea al menos un dibujo (para eso haría falta un evento anónimo, no disponible hoy), fuentes con errores y correos de feedback.
- **Después del lanzamiento:** responder todo el feedback en menos de 48 h, publicar un changelog simple y hacer un segundo anuncio con el v1.1.

---

## 7. Backlog priorizado v1 → v1.1

Criterio: qué echaría más de menos **alguien que dibuja en gráficos todos los días**, sin salir del foco (dibujar libremente). Esfuerzo: S = horas, M = 1–3 días, L = una semana o más.

### Ya resuelto o en curso (verificar y cerrar)
| Función | Estado |
| --- | --- |
| Tipos de gráfico: velas, huecas, barras, línea/área | En curso (Ajustes) |
| Escala logarítmica y porcentual | En curso (Ajustes) |
| Respaldo y restauración de dibujos | En curso (Ajustes) |
| Ayuda de atajos de teclado (`?`) | En curso |
| Menú contextual: duplicar, bloquear, ocultar, orden y borrar | En curso |
| Color personalizado | En curso |
| Parámetros de indicadores | En curso |

### v1 (antes de lanzar)
| # | Función | Por qué para un trader | Esfuerzo |
| --- | --- | --- | --- |
| 1 | Degradación por fuente bloqueada y mercado por defecto en Hyperliquid (B2) | Si el gráfico no carga, el resto no importa | S–M |
| 2 | Recordatorio de respaldo y aviso de Safari (B3) | Perder 200 dibujos destruye la confianza para siempre | S |
| 3 | Aviso “no es asesoría”, atribución de fuente y enlaces legales visibles (B4) | Confianza y obligación legal | S |
| 4 | Onboarding mínimo: en el primer uso, una tarjeta de 3 pasos (“Busca con Ctrl K · Dibuja con T/H/F · Tus dibujos se guardan aquí, haz respaldos”) | El valor está en los atajos y el usuario nuevo no los descubre | S |
| 5 | Tamaño de texto (y fondo opcional) en las herramientas de texto | Hoy el texto es fijo de 14 px; quien anota mucho necesita títulos y notas pequeñas | S |
| 6 | Visualización usable en celular (sin dibujo táctil completo) | Mucho tráfico entrará desde el celular | M |

### v1.1 (primeras 4–6 semanas)
| # | Función | Por qué para un trader | Esfuerzo |
| --- | --- | --- | --- |
| 1 | **Herramienta de posición larga/corta** (entrada, stop, objetivo y relación R:R) | Es de los dibujos más usados por traders a diario. Es un dibujo, no una operación, así que encaja con la regla de no hacer trading | M |
| 2 | **Compartir dibujos entre el mismo activo de distintas fuentes** (BTC de Binance ↔ BTC de Hyperliquid ↔ BTCUSDT de Bybit) | Hoy, si cambias de fuente “pierdes” tus dibujos. Para el usuario es el mismo BTC | M |
| 3 | **Lista de dibujos** (panel con todos los dibujos del símbolo: ocultar, bloquear, borrar o renombrar cada uno) | Con dibujo ilimitado, la gestión se vuelve el problema. Es el complemento natural de la promesa | M |
| 4 | **Niveles de Fibonacci configurables** (niveles, colores, etiquetas) | Cada trader usa sus propios niveles (0.705, 0.886…) | M |
| 5 | **Estilo por defecto por herramienta** (por ejemplo, horizontales siempre rojas y punteadas) | Ahorra decenas de clics al día | S–M |
| 6 | **Visibilidad por temporalidad** (mostrar este dibujo solo en 4H y superiores) | Quien analiza en varias temporalidades se llena de líneas de otras escalas | M |
| 7 | **Inglés** (i18n es/en) | Abre el mercado grande (fase 2 del lanzamiento) | M |
| 8 | **PWA instalable** (manifest, íconos y `sw.js` ya en curso; falta probar la instalación en iOS y Android y explicar en la app cómo instalarla) | Persistencia en Safari, acceso rápido y sensación de app | S |
| 9 | **Dibujo táctil** (celular y tablet) | Tablet y celular son comunes para revisar y dibujar | L |
| 10 | **Heikin-Ashi** | Popular, pero calculado en el cliente se confunde con el precio real; requiere etiquetarlo con claridad | S–M |
| 11 | Selección múltiple y mover o borrar varios dibujos | Útil, pero el panel de dibujos (#3) cubre gran parte de la necesidad | M–L |
| 12 | Selector de zona horaria (local, UTC o la de un exchange) | Quien opera en otra zona o con velas diarias UTC lo pide | S |

### Más adelante (v1.2+)
- **Varios gráficos a la vez** (2 o 4 paneles, con temporalidades y cruz sincronizadas). Muy pedido por traders, pero de esfuerzo L. Valioso tras validar el uso.
- **Comparar símbolos** superpuestos (por ejemplo, oro vs. plata en %).
- **Modo repetición** (*replay*) de velas para practicar dibujo.
- **Plantillas de dibujos** o “copiar dibujos a otro símbolo”.

### Fuera de alcance (por ahora)
- **Sincronización entre dispositivos:** requiere backend, cuentas y datos personales, y rompe la postura de “sin cuentas”. Alternativas sin servidor: respaldo en archivo (ya existe) y, más adelante, guardado automático a un archivo o carpeta del usuario (File System Access API en Chromium) o sincronización opcional con el almacenamiento del propio usuario. Si algún día hay plan de pago, este es el candidato natural, siempre con revisión legal (§4.1).
- **Alertas de precio:** para funcionar con la pestaña cerrada necesitan servidor y notificaciones push; además acercan el producto al trading. Como mucho, más adelante, alertas visuales locales mientras la pestaña está abierta.
- **Trading, órdenes, conexión a cuentas o señales:** excluidos por decisión de producto.

---

## 8. Fuentes consultadas (25-11-2026)

**Binance**
- Términos de Uso de Binance (versión NZ, actualizada el 17-08-2026), cl. 22 y 26: https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/1dd5e6a2445315868bd07ea1861177cb66a7a85f3de974436e6ec1c9a6706d4c.pdf
- Términos globales (la página se renderiza en el cliente y no se puede leer automáticamente): https://www.binance.com/en/terms
- Términos de Binance Vision (CC BY-NC-SA 4.0, v1.0, 26-08-2026): https://data.binance.vision/Binance_Vision-Terms_of_Use.pdf
- URLs de solo datos de mercado: https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only
- Límites (429/418, baneo de 2 min a 3 días): https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits
- Foro de desarrolladores (opinión de un usuario, no oficial): https://dev.binance.vision/t/public-rest-api-for-commercial-use-case/23067
- Error 451 por ubicación restringida (reportes de usuarios): https://dev.binance.vision/t/error-451-when-accessing-the-futures-api-from-us/16725

**Bybit**
- API Terms & Conditions (cl. 5, 6.5, 6.7, 6.9, 10.1): https://www.bybit.com/common-static/compliance/legal/BYBIT/df1923006718fbba8ba70d7d762b9866.pdf · copia: https://bybit.nl/en/help-center/article/API-Terms
- Límites de la API (600 peticiones cada 5 s por IP, 403 y 10 min): https://bybit-exchange.github.io/docs/v5/rate-limit
- Guía de integración (IP de EE. UU. y China continental → 403): https://bybit-exchange.github.io/docs/v5/guide

**Hyperliquid**
- Términos de Uso (interfaz, Hyperliquid Corp., 15-06-2026): https://app.hyperliquid.xyz/terms (se renderiza en el cliente; país por país según resúmenes de terceros, por ejemplo https://www.datawallet.com/crypto/hyperliquid-supported-and-restricted-countries)
- Límites de la API: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits

**Comparativa de términos (tercero, 19-09-2026):** https://cryptomarkets.tools/guides/exchange-api-terms · Coinbase Market Data Terms: https://www.coinbase.com/legal/market_data

**Marcas**
- CHARTIQ, Reg. USPTO 5483997: https://markinton.com/trademark/chartiq-87455367 · https://trademarks.justia.com/owners/chartiq-inc-3669247
- Adquisición de ChartIQ por S&P Global: https://www.waterstechnology.com/data-management/7950485/sp-buys-chartiq-to-bolster-charting-analytics-capabilities
- Productos con el nombre “Chart It”: https://www.producthunt.com/products/chart-it · https://apps.apple.com/nz/app/chartit-app/id1545479626 · https://nathantech.net/products/software/chartit.php · https://github.com/chartit/django-chartit

**Infraestructura y navegador**
- Límites de Cloudflare Pages: https://developers.cloudflare.com/pages/platform/limits/
- Precios de Functions (estáticos gratis e ilimitados): https://developers.cloudflare.com/pages/functions/pricing/
- Cloudflare Web Analytics (sin estado en el cliente, gratis): https://www.cloudflare.com/web-analytics/ · revisión independiente: https://www.ctrl.blog/entry/review-cloudflare-analytics/
- WebKit, política de almacenamiento y `persist()`: https://webkit.org/blog/14403/updates-to-storage-policy/ · límite de 7 días en Safari (resumen y discusión): https://ionic.io/blog/is-apple-trying-to-kill-pwas · https://developer.apple.com/forums/thread/710157

**Contexto del límite de dibujos:** https://coinedition.com/tradingview-faces-backlash-over-chart-restrictions-and-delayed-data/ (informe de segunda mano; algunas fuentes dicen que el plan gratuito no tiene ese límite, así que hay que verificarlo antes de usarlo en un mensaje público).
