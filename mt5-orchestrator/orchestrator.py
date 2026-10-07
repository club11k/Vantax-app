"""
Vantax - orquestador MT5 propio (Vantax Play + Journaly).

Lee, cada cierto intervalo, TODAS las cuentas con credenciales investor
guardadas -- tanto de Vantax Play (cashback en V-COIN por lotaje) como de
Journaly (diario de trading) -- desde un unico endpoint de la app de Vantax
(/api/mt5-orchestrator/pending), se loguea en cada una via el terminal MT5
instalado en esta maquina (paquete oficial `MetaTrader5` de Python - solo
funciona en Windows), lee lo que corresponda segun el tipo de cuenta, y manda
el resultado de vuelta a /api/mt5-orchestrator/report:

  - Cuentas de Vantax Play ("kind": "play"): saldo, equity y lotes de
    XAUUSD cerrados en lo que va del mes -> se acredita V-COIN/progreso por
    el lote nuevo (delta, nunca se re-cuenta lo ya acreditado).
  - Cuentas de Journaly ("kind": "journal"): resultado (P/L) de HOY -> se
    guarda como la entrada del dia en el diario, salvo que el usuario ya
    haya puesto ese dia a mano o por foto (en ese caso la web lo respeta y
    descarta el sync, sin dar error).

Requisitos en esta maquina (VPS Windows):
  - Python 3.10+ (64 bits, tiene que ser la misma arquitectura que MT5)
  - Un terminal de MetaTrader 5 instalado (no hace falta tenerlo abierto a
    mano - este script lo lanza el solo con mt5.initialize(path=...))
  - pip install -r requirements.txt

Configuracion: copia .env.example a .env y rellena los valores.

Sobre varias cuentas en paralelo mas adelante (si el volumen crece mucho):
este script las procesa una detras de otra con UN terminal - de sobra para
decenas de cuentas si el intervalo es de varios minutos. Si en el futuro
hace falta paralelizar, la forma mas simple es lanzar una copia de este
mismo script por cada terminal instalado, cada una con su propio
TERMINAL_PATH - no hace falta reescribirlo desde cero.
"""

import os
import sys
import time
import logging
import subprocess
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv

load_dotenv()


def env_or_exit(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Falta la variable de entorno {name} (revisa tu archivo .env)")
        sys.exit(1)
    return value


VANTAX_API_BASE = env_or_exit("VANTAX_API_BASE").rstrip("/")
VANTAX_MT5_SECRET = env_or_exit("VANTAX_MT5_SECRET")
TERMINAL_PATH = env_or_exit("TERMINAL_PATH")  # ruta completa a terminal64.exe
SYNC_INTERVAL_SECONDS = int(os.environ.get("SYNC_INTERVAL_SECONDS", "900"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mt5-orchestrator")

HEADERS = {"Authorization": f"Bearer {VANTAX_MT5_SECRET}", "Content-Type": "application/json"}


def fetch_pending_accounts():
    resp = requests.get(f"{VANTAX_API_BASE}/api/mt5-orchestrator/pending", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json().get("accounts", [])


def report_play_result(account_id, balance, equity, lots_this_month, profit_amount):
    resp = requests.post(
        f"{VANTAX_API_BASE}/api/mt5-orchestrator/report",
        headers=HEADERS,
        json={
            "kind": "play",
            "accountId": account_id,
            "balance": balance,
            "equity": equity,
            "lotsThisMonth": lots_this_month,
            "profitAmount": profit_amount,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def report_journal_result(account_id, result_amount, balance=None):
    resp = requests.post(
        f"{VANTAX_API_BASE}/api/mt5-orchestrator/report",
        headers=HEADERS,
        json={
            "kind": "journal",
            "accountId": account_id,
            "resultAmount": result_amount,
            # Saldo real de la cuenta: Vantax lo usa para fijar el saldo
            # inicial de Journaly la primera vez (antes no se enviaba y el
            # saldo se quedaba en "Esperando el primer saldo real de MT5").
            "balance": balance,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def read_account(mt5, login, password, server):
    """Se loguea en la cuenta indicada en el terminal ya inicializado y lee
    todo lo que puede hacer falta (Play y/o Journaly) de una sola pasada por
    el historial del mes, para no tener que loguear dos veces la misma
    cuenta. Devuelve un dict con balance, equity, lots_xauusd_month (para
    Play) y profit_today (para Journaly)."""
    if not mt5.login(int(login), password=password, server=server):
        raise RuntimeError(f"Login fallido ({mt5.last_error()})")

    info = mt5.account_info()
    if info is None:
        raise RuntimeError(f"No se pudo leer account_info ({mt5.last_error()})")

    now = datetime.now()
    month_start = datetime(now.year, now.month, 1)
    today_start = datetime(now.year, now.month, now.day)

    deals = mt5.history_deals_get(month_start, now + timedelta(days=1))
    deals = deals or ()

    lots_xauusd_month = 0.0
    profit_month = 0.0
    profit_today = 0.0
    for d in deals:
        profit_month += d.profit
        deal_time = datetime.fromtimestamp(d.time)
        if deal_time >= today_start:
            profit_today += d.profit
        # DEAL_ENTRY_OUT = la parte de "cierre" del trade - contar solo esta
        # evita duplicar el lotaje (cada trade cerrado deja normalmente un
        # deal de entrada y uno de salida con el mismo volumen).
        if d.symbol == "XAUUSD" and d.entry == mt5.DEAL_ENTRY_OUT:
            lots_xauusd_month += d.volume

    return {
        "balance": info.balance,
        "equity": info.equity,
        "lots_xauusd_month": lots_xauusd_month,
        "profit_month": profit_month,
        "profit_today": profit_today,
    }


def kill_terminal():
    """Cierra a la fuerza el terminal MT5. Tras un login fallido (p. ej. una
    cuenta con contraseña o servidor mal puestos) el terminal se queda
    colgado intentando conectar, y el siguiente initialize() da
    'IPC timeout' aunque esa otra cuenta esté bien. Matarlo y empezar
    limpio evita que una cuenta mala tumbe a todas las demás (06/10/2026)."""
    exe = os.path.basename(TERMINAL_PATH) or "terminal64.exe"
    subprocess.run(["taskkill", "/F", "/IM", exe], capture_output=True)
    time.sleep(3)


def read_account_with_retry(mt5, acc):
    """Inicializa el terminal, lee la cuenta y lo cierra. Si algo falla,
    mata el terminal y lo reintenta una vez desde cero."""
    last_exc = None
    for attempt in (1, 2):
        try:
            if not mt5.initialize(path=TERMINAL_PATH, timeout=90000):
                raise RuntimeError(f"No se pudo inicializar el terminal ({mt5.last_error()})")
            try:
                return read_account(mt5, acc["login"], acc["password"], acc["server"])
            finally:
                mt5.shutdown()
        except Exception as exc:
            last_exc = exc
            try:
                mt5.shutdown()
            except Exception:
                pass
            kill_terminal()
            if attempt == 1:
                log.warning("Reintentando %s tras error: %s", acc.get("accountNumber") or acc["login"], exc)
    raise last_exc


def sync_once():
    try:
        import MetaTrader5 as mt5
    except ImportError:
        log.error("Falta instalar el paquete MetaTrader5 (pip install MetaTrader5) - solo funciona en Windows.")
        sys.exit(1)

    accounts = fetch_pending_accounts()
    log.info("Cuentas pendientes de sincronizar: %d", len(accounts))

    # Una misma cuenta MT5 puede estar a la vez en Play y en Journaly: se lee
    # una sola vez por ciclo y se reutiliza el dato (o el error).
    cache = {}

    for acc in accounts:
        account_id = acc["accountId"]
        kind = acc.get("kind", "play")
        label = f"[{kind}] {acc.get('brokerName') or ''} {acc.get('accountNumber') or ''}".strip()
        key = (str(acc["login"]), acc["server"])
        try:
            if key not in cache:
                try:
                    cache[key] = ("ok", read_account_with_retry(mt5, acc))
                except Exception as exc:
                    cache[key] = ("error", exc)
            status, data = cache[key]
            if status == "error":
                raise data

            if kind == "journal":
                result = report_journal_result(account_id, data["profit_today"], data["balance"])
                log.info("%s -> resultado_hoy=%.2f saldo=%.2f | %s", label, data["profit_today"], data["balance"], result)
            else:
                result = report_play_result(
                    account_id, data["balance"], data["equity"], data["lots_xauusd_month"], data["profit_month"]
                )
                log.info("%s -> saldo=%.2f lotes_XAUUSD_mes=%.2f | %s", label, data["balance"], data["lots_xauusd_month"], result)
        except Exception as exc:
            log.error("%s -> error: %s", label, exc)


def main():
    log.info("Orquestador MT5 de Vantax (Play + Journaly) arrancado (intervalo: %ss)", SYNC_INTERVAL_SECONDS)
    while True:
        sync_once()
        time.sleep(SYNC_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
