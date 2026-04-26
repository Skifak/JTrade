/**
 * Минималистичный клиент Binance Spot WebSocket (combined streams).
 *
 *   wss://stream.binance.com:9443/stream?streams=btcusdt@bookTicker/ethusdt@bookTicker
 *
 * Без ключей. Подписка на @bookTicker (best bid/ask) — обновляется при каждом
 * изменении стакана, реальный реалтайм. Цена считается как mid = (bid + ask) / 2.
 *
 * Использование:
 *   const ws = new BinanceWs({ onTick, onStatus });
 *   ws.setSymbols(['BTCUSDT', 'ETHUSDT']);
 *   ws.close();
 */

const URL = 'wss://stream.binance.com:9443/stream';

// Включи в DevTools-консоли: `localStorage.debugWs = '1'; location.reload()`
const DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('debugWs') === '1';

export class BinanceWs {
  /**
   * @param {{
   *   onTick:   (info:{ symbol:string, price:number, eventTime:number, latencyMs:number }) => void,
   *   onStatus?: (info:{ connected:boolean, error?:string }) => void
   * }} handlers
   */
  constructor({ onTick, onStatus }) {
    this.onTick = onTick;
    this.onStatus = onStatus || (() => {});
    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {Set<string>} */
    this.symbols = new Set();
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.closedByUser = false;
  }

  /** @param {string[]} symbols Binance-формат, uppercase, например ['BTCUSDT'] */
  setSymbols(symbols) {
    const next = new Set(symbols.map((s) => String(s).toUpperCase()));
    const same = next.size === this.symbols.size && [...next].every((s) => this.symbols.has(s));
    this.symbols = next;
    if (same && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.connect();
  }

  connect() {
    this.closedByUser = false;
    this.disposeSocket();
    if (this.symbols.size === 0) {
      this.onStatus({ connected: false });
      return;
    }
    // Подписываемся СРАЗУ на два потока на каждый символ:
    //   @bookTicker — каждое изменение лучшей котировки в стакане (mid).
    //   @aggTrade   — каждое исполнение сделки (last trade price).
    // bookTicker даёт mid-цену по спросу/предложению, aggTrade — реальные сделки.
    // Вместе это покрывает все микродвижения и обеспечивает максимальную частоту.
    const streams = [...this.symbols].flatMap((s) => {
      const lo = s.toLowerCase();
      return [`${lo}@bookTicker`, `${lo}@aggTrade`];
    }).join('/');
    const url = `${URL}?streams=${streams}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.onStatus({ connected: false, error: String(err?.message || err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      if (DEBUG) console.debug('[Binance WS] open, streams:', streams);
      this.onStatus({ connected: true });
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const d = msg?.data;
        if (!d) {
          if (DEBUG) console.debug('[Binance WS] msg without data:', msg);
          return;
        }

        // Combined stream: msg.stream выглядит как 'btcusdt@bookTicker' или 'btcusdt@aggTrade'.
        const stream = String(msg.stream || '');
        const eventType = d.e || (stream.endsWith('@aggTrade') ? 'aggTrade' : 'bookTicker');
        const sym = d.s;
        if (!sym) return;

        let price;
        let eventTime;

        if (eventType === 'aggTrade') {
          // aggTrade: { e:'aggTrade', E, s, p, q, T (trade time), ... }
          price = Number(d.p);
          eventTime = Number(d.T) || Number(d.E) || Date.now();
        } else {
          // bookTicker: { u, s, b, B, a, A } — нет E. Берём mid bid/ask.
          const bid = Number(d.b);
          const ask = Number(d.a);
          if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
          price = (bid + ask) / 2;
          eventTime = Date.now();
        }

        if (!Number.isFinite(price) || price <= 0) return;

        const latencyMs = Math.max(0, Date.now() - eventTime);
        this.onTick({
          symbol: sym,
          price,
          eventTime,
          latencyMs
        });
      } catch (err) {
        if (DEBUG) console.error('[Binance WS] parse error:', err);
      }
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
