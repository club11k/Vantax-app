# Orquestador MT5 propio de Vantax (Play + Journaly)

Esto reemplaza a Myfxbook como fuente de datos, y además rellena solo el
diario de Journaly. En vez de depender de una cuenta de Myfxbook por
jugador, este script se loguea directamente en MT5 (modo investor, solo
lectura) usando las mismas credenciales que ya se guardan cifradas en
Vantax cuando alguien vincula una cuenta "a mano" — tanto en Vantax Play
como en Journaly — y manda el resultado a la web. El lado de Vantax (la
web) ya está listo — esto es la pieza que falta: la máquina que de verdad
habla con MT5.

Un mismo ciclo de sincronización procesa las dos cosas: para cada cuenta
con credenciales guardadas, la web le dice al script si es una cuenta de
Vantax Play o de Journaly (campo `kind`), y el script calcula lo que
corresponda a partir del mismo historial de MT5 que ya está leyendo:

- **Vantax Play**: lotes de XAUUSD cerrados en lo que va del mes → V-COIN,
  progreso, cofres (igual que antes).
- **Journaly**: resultado (P/L) de hoy → la entrada del diario de ese día,
  sin pisar nunca una entrada que el usuario ya haya puesto a mano o por
  foto (si ya hay una, la web la respeta y descarta el sync de ese día).

**Corre en una VPS Windows aparte, no en Render** (el paquete `MetaTrader5`
de Python solo funciona en Windows, y necesita un terminal de MT5 instalado
de verdad).

## Qué necesitas contratar/instalar

1. Una VPS con **Windows** (con 2-4 GB de RAM sobra para bastantes cuentas).
   Proveedores típicos: Contabo, OVH, Vultr, Hostwinds — cualquiera con
   plan Windows Server o Windows 10/11 sirve.
2. **Python 3.10 o más nuevo, de 64 bits** instalado en esa VPS.
3. El terminal de **MetaTrader 5** instalado en esa misma VPS (uno solo
   basta para empezar — se reutiliza para todas las cuentas, una detrás de
   otra). Se descarga gratis desde la web del broker o metatrader5.com.

## Instalación

Copia esta carpeta entera (`mt5-orchestrator/`) a la VPS, y desde una
consola (cmd o PowerShell) dentro de esa carpeta:

```
pip install -r requirements.txt
copy .env.example .env
```

Edita `.env` con un editor de texto y rellena:

- `VANTAX_API_BASE`: la URL de tu app en Render.
- `VANTAX_MT5_SECRET`: un secreto largo que inventes tú (ver el propio
  `.env.example` para cómo generarlo). **Tienes que poner ese mismo valor**
  como variable de entorno `MT5_ORCHESTRATOR_SECRET` en Render (Settings →
  Environment de tu servicio Vantax-app) — si no coinciden, la web rechaza
  las peticiones del orquestador.
- `TERMINAL_PATH`: la ruta al `terminal64.exe` de tu instalación de MT5 en
  esa VPS (normalmente algo como `C:\Program Files\MetaTrader 5\terminal64.exe`,
  pero puede variar según el broker).

## Arrancarlo

```
python orchestrator.py
```

Se queda corriendo indefinidamente, sincronizando todas las cuentas
pendientes cada `SYNC_INTERVAL_SECONDS` (15 minutos por defecto). Para que
siga funcionando aunque cierres la sesión de la VPS, lo más simple es
crearle una tarea en el **Programador de tareas de Windows** que lo lance al
iniciar el sistema, o instalarlo como servicio con una herramienta como
[NSSM](https://nssm.cc/) (`nssm install VantaxMT5 python C:\ruta\orchestrator.py`).

## Cómo sabe qué cuentas leer

Llama a `GET /api/mt5-orchestrator/pending` en tu app de Vantax, que le
devuelve TODAS las cuentas (de Vantax Play y de Journaly juntas) que tengan
login/contraseña investor guardados — los mismos que ya se piden en el
formulario "vincular cuenta MT5 a mano" del panel de jugador, y los nuevos
campos opcionales equivalentes en Journaly. Cada cuenta viene marcada con
`kind: "play"` o `kind: "journal"`.

Por cada una, se loguea en el terminal y lee del historial de MT5 lo que
corresponda según el `kind`, y llama a `POST /api/mt5-orchestrator/report`
(con ese mismo `kind` en el cuerpo) con el resultado:

- `kind: "play"` → saldo, equity y lotes de XAUUSD cerrados este mes. La web
  se encarga del resto (V-COIN, progreso, cofres), exactamente igual que ya
  hace con el sync de Myfxbook.
- `kind: "journal"` → el resultado (P/L) de hoy. La web lo guarda como la
  entrada del diario de hoy, salvo que ya haya una puesta a mano o por foto.

**Importante si vienes de una versión anterior de este script**: las rutas
antiguas `/api/play/mt5-orchestrator/pending` y `/report` ya no existen — si
tu repo de GitHub todavía tiene esa carpeta (`src/app/api/play/mt5-orchestrator/`),
bórrala, y asegúrate de tener la nueva `src/app/api/mt5-orchestrator/` (sin
el `play/` en medio) en su lugar.

## Nota de seguridad

Esta VPS va a tener, en algún momento, las contraseñas investor de tus
jugadores en texto plano en memoria (mientras el script las usa para hacer
login) — nunca en disco, solo de paso. Trátala con el mismo cuidado que
cualquier otro servidor con datos sensibles: contraseña fuerte de acceso a
la VPS, no compartas el archivo `.env`, y mantén Windows actualizado.

## Escalar más adelante

Si algún día tienes tantas cuentas que 15 minutos no dan abasto con un solo
terminal, la forma más simple de paralelizar es instalar varios terminales
MT5 (cada uno en su propia carpeta) y lanzar una copia de `orchestrator.py`
por terminal, cada una con su propio `TERMINAL_PATH` en su propio `.env` —
todas pueden compartir el mismo `VANTAX_MT5_SECRET` y apuntar a la misma
`VANTAX_API_BASE`, la web ya sabe llevar la cuenta de qué se sincronizó y
qué no sin importar cuántos orquestadores se lo pidan.
