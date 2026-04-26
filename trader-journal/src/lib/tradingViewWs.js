/**
 * Минимальный клиент публичного WebSocket TradingView (data feed).
 *
 *   wss://data.tradingview.com/socket.io/websocket
 *
 * API неофициальный, реверс-инжиниринговый, ключей не требует.
 * Используется в десятках open-source проектов (tradingview-scraper и т.п.).
 * Может перестать работать без предупреждения.
 *
 * Протокол (упрощённо):
 *   - Каждое сообщение оборачивается в `~m~LENGTH~m~JSON`.
 *   - Сервер шлёт heartbeat `~m~3~m~~h~N` — нужно отвечать тем же телом.
 *   - Создаём quote-сессию, добавляем символы, получаем `qsd` события с поле `lp` (last price).
 *
 * Символы вида `<EXCHANGE>:<TICKER>`. Маппинг настраивается через `mapSymbol`.
 */

const URL = 'wss://data.tradingview.com/socket.io/websocket';
const AUTH_TOKEN = 'unauthorized_user_token';

// Включи в DevTools-консоли: `localStorage.debugWs = '1'; location.reload()`
const DEBUG = (() => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('debugWs') === '1'; }
  catch { return false; }
})();

function randomSession(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = prefix + '_';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function packMessage(payloadObj) {
  const json = JSON.stringify(payloadObj);
  return `~m~${json.length}~m~${json}`;
}

function packRaw(body) {
  return `~m~${body.length}~m~${body}`;
}

function unpackFrames(raw) {
  const out = [];
  const re = /~m~(\d+)~m~/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const len = parseInt(match[1], 10);
    const start = match.index + match[0].length;
    const body = raw.substring(start, start + len);
    out.push(body);
    re.lastIndex = start + len;
  }
  return out;
}

/**
 * Дефолтный маппер на TradingView-символы.
 *
 * ВАЖНО: на anonymous-токене TV отдаёт **realtime tick-by-tick** только для
 * брокерских feeds типа `OANDA:` (форекс-брокер пушит свои собственные
 * котировки) и `BINANCE:` (но крипту мы и так гоним прямо через Binance WS).
 *
 * `FX:`, `FX_IDC:`, `TVC:`, `SP:`, `NASDAQ:`, `DJ:` на anonymous обычно
 * **delayed** (минуты — десятки минут) и обновляются редко. Поэтому ставим
 * OANDA там, где это возможно.
 */
export function defaultMapSymbol(key) {
  const k = String(key || '').toUpperCase();
  if (!k) return null;

  // Сырьё — у OANDA свои CFD-инструменты, тикают так же как FX (real-time)
  if (['USOIL', 'WTI', 'WTIUSD', 'XTIUSD', 'CRUDE', 'OILUSD'].includes(k)) return 'OANDA:WTICOUSD';
  if (['UKOIL', 'BRENT', 'XBRUSD', 'BRENTUSD'].includes(k)) return 'OANDA:BCOUSD';
  if (['NATGAS', 'NGUSD', 'XNGUSD'].includes(k)) return 'OANDA:NATGASUSD';
  if (['COPPER', 'XCUUSD'].includes(k)) return 'OANDA:XCUUSD';
  // Soft commodities у OANDA нет, оставляем фьючерсы (могут быть delayed)
  if (k === 'COCOAUSD') return 'ICEUS:CC1!';
  if (k === 'COFFEEUSD') return 'ICEUS:KC1!';
  if (k === 'SUGARUSD') return 'ICEUS:SB1!';
  if (k === 'WHEATUSD') return 'CBOT:ZW1!';
  if (k === 'CORNUSD') return 'CBOT:ZC1!';

  // Индексы — OANDA CFD, real-time
  if (['US500', 'SPX500', 'SP500'].includes(k)) return 'OANDA:SPX500USD';
  if (['US100', 'NAS100', 'NASDAQ100'].includes(k)) return 'OANDA:NAS100USD';
  if (['US30', 'DJ30', 'US30CASH'].includes(k)) return 'OANDA:US30USD';
  if (['GER40', 'DE40', 'GER30'].includes(k)) return 'OANDA:DE30EUR';
  if (['UK100', 'FTSE100'].includes(k)) return 'OANDA:UK100GBP';
  if (['JPN225', 'JP225'].includes(k)) return 'OANDA:JP225USD';
  if (['HK50', 'HKG33'].includes(k)) return 'OANDA:HK33HKD';
  if (['AUS200', 'AUS200AUD'].includes(k)) return 'OANDA:AU200AUD';
  if (['FRA40', 'FR40'].includes(k)) return 'OANDA:FR40EUR';

  // Металлы — OANDA real-time
  if (k.startsWith('XAU')) return 'OANDA:XAUUSD';
  if (k.startsWith('XAG')) return 'OANDA:XAGUSD';
  if (k.startsWith('XPT')) return 'OANDA:XPTUSD';
  if (k.startsWith('XPD')) return 'OANDA:XPDUSD';

  // FX 6-char — OANDA real-time tick stream
  if (/^[A-Z]{6}$/.test(k)) return `OANDA:${k}`;

  return null;
}

export class TradingViewWs {
  /**
   * @param {{
   *   onTick:   (info:{ symbol:string, price:number, eventTime:number, latencyMs:number }) => void,
   *   onStatus?: (info:{ connected:boolean, error?:string }) => void,
   *   mapSymbol?: (key:string) => string|null
   * }} handlers
   */
  constructor({ onTick, onStatus, mapSymbol }) {
    this.onTick = onTick;
    this.onStatus = onStatus || (() => {});
    this.mapSymbol = mapSymbol || defaultMapSymbol;

    /** @type {WebSocket|null} */
    this.ws = null;
    this.session = null;
    /** @type {Set<string>} наши внутренние ключи (EURUSD, XAUUSD…) */
    this.keys = new Set();
    /** @type {Map<string, string>} TV-symbol → внутренний ключ */
    this.tvToKey = new Map();
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.closedByUser = false;
  }

  /** @param {string[]} keys внутренние коды (EURUSD, BTCUSD не сюда!) */
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
    if (this.keys.size === 0) {
      this.onStatus({ connected: false });
      return;
    }

    this.tvToKey.clear();
    const tvSymbols = [];
    for (const key of this.keys) {
      const tv = this.mapSymbol(key);
      if (!tv) continue;
      this.tvToKey.set(tv, key);
      tvSymbols.push(tv);
    }
    if (tvSymbols.length === 0) {
      this.onStatus({ connected: false, error: 'Нет совместимых символов для TradingView' });
      return;
    }

    try {
      this.ws = new WebSocket(URL);
    } catch (err) {
      this.onStatus({ connected: false, error: String(err?.message || err) });
      this.scheduleReconnect();
      return;
    }

    this.session = randomSession('qs');

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Минимально валидный flow для quote-сессии. Любое неизвестное поле в
      // quote_set_fields роняет сессию с protocol_error.
      this.send('set_auth_token', [AUTH_TOKEN]);
      this.send('set_locale', ['en', 'US']);
      this.send('quote_create_session', [this.session]);
      this.send('quote_set_fields', [
        this.session,
        'lp', 'ch', 'chp', 'volume', 'bid', 'ask', 'lp_time', 'update_mode'
      ]);
      this.send('quote_add_symbols', [this.session, ...tvSymbols]);
      this.send('quote_fast_symbols', [this.session, ...tvSymbols]);
      if (DEBUG) console.debug('[TV WS] open, symbols:', tvSymbols);
      this.onStatus({ connected: true });
    };

    this.ws.onmessage = (ev) => {
      const frames = unpackFrames(String(ev.data || ''));
      for (const frame of frames) {
        if (!frame) continue;

        // Heartbeat: TV шлёт `~h~N`, надо вернуть точно так же.
        if (frame.startsWith('~h~')) {
          try { this.ws.send(packRaw(frame)); } catch (_) {}
          continue;
        }

        let parsed;
        try { parsed = JSON.parse(frame); } catch (_) { continue; }
        if (!parsed) continue;

        if (DEBUG) console.debug('[TV WS] msg:', parsed);

        if (parsed.m === 'qsd') {
          // p: [sessionId, { n: 'FX:EURUSD', s: 'ok', v: { lp: 1.09, bid, ask, ... } }]
          const node = Array.isArray(parsed.p) ? parsed.p[1] : null;
          const tvSym = node?.n;
          const status = node?.s;
          const v = node?.v || {};
          if (DEBUG) console.debug('[TV WS] qsd:', tvSym, status, v);
          let lp = Number(v.lp);
          if (!Number.isFinite(lp) || lp <= 0) {
            const bid = Number(v.bid);
            const ask = Number(v.ask);
            if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
              lp = (bid + ask) / 2;
            }
          }
          if (!tvSym) continue;
          if (status === 'error') {
            if (DEBUG) console.warn('[TV WS] symbol error:', tvSym, v);
            continue;
          }
          if (!Number.isFinite(lp) || lp <= 0) {
            if (DEBUG) console.debug('[TV WS] qsd без lp/bid/ask, пропускаем:', tvSym, v);
            continue;
          }
          const internalKey = this.tvToKey.get(tvSym);
          if (!internalKey) {
            if (DEBUG) console.warn('[TV WS] нет mapping tvSym → internalKey:', tvSym);
            continue;
          }
          if (DEBUG) console.debug('[TV WS] tick →', internalKey, '=', lp);
          const eventTime = Date.now();
          this.onTick({
            symbol: internalKey,
            price: lp,
            eventTime,
            latencyMs: 0
          });
        } else if (parsed.m === 'protocol_error' || parsed.m === 'critical_error') {
          if (DEBUG) console.error('[TV WS]', parsed.m, parsed.p);
          this.onStatus({ connected: false, error: `TV ${parsed.m}: ${(parsed.p || []).join(' ')}` });
          try { this.ws?.close(); } catch (_) {}
        }
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

  send(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(packMessage({ m: method, p: params }));
    } catch (_) {}
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
