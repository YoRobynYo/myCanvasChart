const LONDON_TIME_ZONE = 'Europe/London';
const SESSION_START_MINUTE = 7 * 60;
const SESSION_END_MINUTE = 16 * 60;

const londonClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * The ICT 3 review window is 07:00 inclusive to 16:00 exclusive in London.
 * Intl applies the UK daylight-saving offset automatically.
 */
export function isWithinLondonSession(timestamp: number): boolean {
  if (!Number.isFinite(timestamp)) return false;

  const parts = londonClock.formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const minuteOfDay = hour * 60 + minute;
  return minuteOfDay >= SESSION_START_MINUTE && minuteOfDay < SESSION_END_MINUTE;
}
