/** Every IANA time zone the browser knows, with `current` kept in the list. */
export function timeZones(current?: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    // Older browsers: only the current zone is offered.
  }
  if (current && !zones.includes(current)) return [current, ...zones];
  return zones;
}

/** The browser's own time zone, a sensible default for a new campus. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** "America/New_York" → "America/New York". */
export function timeZoneLabel(zone: string): string {
  return zone.replaceAll("_", " ");
}
