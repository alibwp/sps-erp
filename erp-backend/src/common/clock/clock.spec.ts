import { Clock, FixedClock, calendarDay } from './clock.js';

describe('Clock', () => {
  it('schoolToday crosses the date line: 23:30 UTC is the next day in Asia/Karachi', () => {
    const clock = new FixedClock(new Date('2026-11-05T23:30:00Z'));

    expect(clock.schoolToday('UTC')).toBe('2026-11-05');
    expect(clock.schoolToday('Asia/Karachi')).toBe('2026-11-06');
  });

  it('schoolToday is still the previous day west of UTC', () => {
    const clock = new FixedClock(new Date('2026-11-06T02:00:00Z'));
    expect(clock.schoolToday('America/New_York')).toBe('2026-11-05');
  });

  it('handles the year boundary', () => {
    expect(calendarDay(new Date('2026-12-31T19:00:00Z'), 'Asia/Karachi')).toBe(
      '2027-01-01',
    );
  });

  it('refuses an unknown time zone', () => {
    expect(() => new Clock().schoolToday('Mars/Olympus')).toThrow(RangeError);
  });

  it('FixedClock stays put until moved and returns copies', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const first = clock.now();
    first.setFullYear(2000);

    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    clock.set(new Date('2026-02-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('the real clock follows the system time', () => {
    const before = Date.now();
    const now = new Clock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now - before).toBeLessThan(1000);
  });
});
