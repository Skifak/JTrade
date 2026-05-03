/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { parseMt5ReportHtml } from './mt5Parser.js';

describe('parseMt5ReportHtml', () => {
  it('случайный HTML не считается MT5', () => {
    const r = parseMt5ReportHtml('<html><body><p>hello</p></body></html>');
    expect(r.reportType).toBeNull();
    expect(r.trades).toEqual([]);
    expect(r.looksLikeMt5).toBe(false);
  });

  it('title Trade Report распознаётся как trade kind', () => {
    const html = `<!DOCTYPE html><html><head><title>Trade Report</title></head><body></body></html>`;
    const r = parseMt5ReportHtml(html);
    expect(r.reportType).toBe('trade');
    expect(r.looksLikeMt5).toBe(true);
    expect(Array.isArray(r.trades)).toBe(true);
  });
});
