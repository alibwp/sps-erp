import { Injectable } from '@nestjs/common';

// The one place the app reads the current time, so tests can freeze it.
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  // The calendar day (YYYY-MM-DD) it is now in the given IANA time zone,
  // for example a campus's `timezone`. Throws RangeError on an unknown zone.
  schoolToday(timeZone: string): string {
    return calendarDay(this.now(), timeZone);
  }
}

// A clock that stays at one instant until moved. For tests.
export class FixedClock extends Clock {
  constructor(private instant: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.instant.getTime());
  }

  set(instant: Date): void {
    this.instant = instant;
  }
}

export function calendarDay(instant: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
