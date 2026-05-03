/**
 * Публичный WebSocket Kraken (spot), канал `ticker`.
 *
 *   wss://ws.kraken.com/
 *
 * Без API-ключа. Цена: mid(best bid, best ask) из полей `b`/`a`.
 *
 * На Kraken доступен ограниченный набор фиатных кроссов + XAUT/USD (прокси золота).
 * Остальные тикеры — только через HTTP (`marketData`).
 */

const WS_URL = 'wss://ws.kraken.com/';

/** EURUSD → EUR/USD; только то, что реально есть в AssetPairs Kraken (мажоры). */
const KRAKEN_FX_WSNAME = new Set([
  'AUD/JPY',
  'AUD/USD',
  'EUR/AUD',
  'EUR/CAD',
  'EUR/CHF',
  'EUR/GBP',
  'EUR/JPY',
  'EUR/USD',
  'GBP/USD',
  'USD/CAD',
  'USD/CHF',
  'USD/JPY'
]);

const DEBUG = (() => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('debugWs') === '1'; }
  catch { return false; }
})();

/**
 * Внутренний ключ журнала → пара Kraken `BASE/QUOTE` или null (нет spot ticker).
 */
export function mapKeyToKrakenPair(key) {
  const k = String(key || '').toUpperCase();
  if (!k) return null;

  if (k.startsWith('XAU')) return 'XAUT/USD';

  if (k.startsWith('XAG') || k.startsWith('XPT') || k.startsWith('XPD')) return null;

  if (!/^[A-Z]{6}$/.test(k)) return null;

  const wsname = `${k.slice(0, 3)}/${k.slice(3)}`;
  return KRAKEN_FX_WSNAME.has(wsname) ? wsname : null;
}

export class KrakenWs {
  /**
   * @param {{
   *   onTick:   (info:{ symbol:string, price:number, eventTime:number, latencyMs:number }) => void,
   *   onStatus?: (info:{ connected:boolean, error?:string }) => void,
   *   mapPair?: (key:string) => string|null
   * }} handlers
   */
  constructor({ onTick, onStatus, mapPair }) {
    this.onTick = onTick;
    this.onStatus = onStatus || (() => {});
    this.mapPair = mapPair || mapKeyToKrakenPair;

    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {Set<string>} внутренние ключи */
    this.keys = new Set();
    /** Kraken wsname → внутренний ключ */
    this.pairToKey = new Map();

    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.closedByUser = false;
  }

  /** @param {string[]} keys внутренние коды */
  setSymbols(keys) {
    const next = new Set(keys.map((k) => String(k).toUpperCase()).filter(Boolean));
    const same = next.size === this.keys.size && [...next].every((k) => this.keys.has(k));
    this.keys = next;
    if (same && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.connect();
  }

  connect() {
    this.closedByUser = false;
    this.disposeSocket();

    this.pairToKey.clear();
    const pairs = [];
    for (const key of this.keys) {
      const pair = this.mapPair(key);
      if (!pair) continue;
      const p = String(pair).trim();
      this.pairToKey.set(p, key);
      pairs.push(p);
    }

    if (pairs.length === 0) {
      this.onStatus({ connected: false });
      return;
    }

    try {
      if (DEBUG) console.debug('[Kraken WS] connect →', WS_URL, pairs);
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      this.onStatus({ connected: false, error: String(err?.message || err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      try {
        this.ws.send(JSON.stringify({
          event: 'subscribe',
          pair: pairs,
          subscription: { name: 'ticker' }
        }));
      } catch (e) {
        this.onStatus({ connected: false, error: String(e?.message || e) });
        try { this.ws?.close(); } catch (_) {}
        return;
      }
      if (DEBUG) console.debug('[Kraken WS] subscribed ticker', pairs);
      this.onStatus({ connected: true });
    };

    this.ws.onmessage = (ev) => {
      let raw = ev.data;
      if (typeof raw !== 'string') return;
      let msg;
      try { msg = JSON.parse(raw); } catch (_) { return; }

      if (msg && typeof msg === 'object' && !Array.isArray(msg) && msg.event) {
        if (msg.event === 'subscriptionStatus' && msg.status === 'error' && DEBUG) {
          console.warn('[Kraken WS] subscriptionStatus error', msg.pair, msg.errorMessage);
        }
        return;
      }

      if (!Array.isArray(msg) || msg.length < 4) return;

      const ticker = msg[1];
      const pairName = typeof msg[2] === 'string' ? msg[2] : null;
      if (!pairName || !ticker || typeof ticker !== 'object') return;

      const bid = Number(ticker.b?.[0]);
      const ask = Number(ticker.a?.[0]);
      let price;
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        price = (bid + ask) / 2;
      } else {
        const c = Number(ticker.c?.[0]);
        if (Number.isFinite(c) && c > 0) price = c;
      }
      if (!Number.isFinite(price) || price <= 0) return;

      const internalKey = this.pairToKey.get(pairName);
      if (!internalKey) return;

      const eventTime = Date.now();
      const latencyMs = 0;
      this.onTick({ symbol: internalKey, price, eventTime, latencyMs });
    };

    this.ws.onclose = () => {
      this.onStatus({ connected: false });
      if (!this.closedByUser) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      try { this.ws?.close(); } catch (_) {}
    };
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(15_000, 1_000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disposeSocket() {
    if (this.ws) {
      try { this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null; } catch (_) {}
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this.disposeSocket();
    this.onStatus({ connected: false });
  }
}
