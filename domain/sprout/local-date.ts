const LOCAL_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

export function createLocalDateKey(
  value: Date,
  timeZoneOffsetMinutes: number = value.getTimezoneOffset(),
): string {
  if (!Number.isFinite(value.getTime()) || !Number.isFinite(timeZoneOffsetMinutes)) {
    throw new Error("A valid date and timezone offset are required");
  }

  const localTime = new Date(value.getTime() - timeZoneOffsetMinutes * 60_000);
  return `${localTime.getUTCFullYear()}-${padDatePart(localTime.getUTCMonth() + 1)}-${padDatePart(
    localTime.getUTCDate(),
  )}`;
}

export function isLocalDateKey(value: string): boolean {
  if (!LOCAL_DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
