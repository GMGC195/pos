// Saudi Arabia (Asia/Riyadh - UTC+3) Timezone Utilities

/**
 * Returns today's date formatted as 'YYYY-MM-DD' in Asia/Riyadh timezone.
 * Uses Intl.DateTimeFormat with 'en-CA' for guaranteed ISO format.
 */
export const getSaudiTodayDate = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

/**
 * Returns yesterday's date formatted as 'YYYY-MM-DD' in Asia/Riyadh timezone.
 */
export const getSaudiYesterdayDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

/**
 * Returns 7 days ago date formatted as 'YYYY-MM-DD' in Asia/Riyadh timezone.
 */
export const getSaudiWeekAgoDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

/**
 * Formats a date/timestamp to Saudi Arabia date string (e.g. "Oct 15, 2026")
 */
export const formatSaudiDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Formats a date/timestamp to Saudi Arabia time string (e.g. "08:30 PM")
 */
export const formatSaudiTime = (dateStr, showSeconds = false) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: true
  });
};

/**
 * Formats a date/timestamp to full Saudi Arabia date & time string
 * (e.g. "Oct 15, 2026, 08:30 PM")
 */
export const formatSaudiDateTime = (dateStr, showSeconds = false) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: true
  });
};

/**
 * Returns the current live Saudi Arabia time formatted for clocks/headers.
 */
export const getSaudiLiveTimeString = () => {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

/**
 * Formats a date/timestamp to Saudi Arabia 24-hour time string (e.g. "14:30" or "14:30:45")
 */
export const formatSaudiTime24 = (dateStr, showSeconds = false) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: false
  });
};

/**
 * Extracts 'YYYY-MM-DD' from a date or timestamp in Asia/Riyadh timezone.
 */
export const getSaudiDateString = (dateInput) => {
  if (!dateInput) return getSaudiTodayDate();
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return getSaudiTodayDate();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

/**
 * Formats an ISO string to 'HH:mm' for <input type="time"> inputs in Asia/Riyadh timezone.
 */
export const toSaudiTimeInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Converts a Saudi date ('YYYY-MM-DD') and time ('HH:mm') into an ISO string anchored to +03:00.
 * Guarantees zero timezone drift regardless of client or server timezone.
 */
export const saudiTimeToISO = (dateStr, timeStr) => {
  if (!timeStr) return null;
  const cleanTime = timeStr.trim().length === 5 ? `${timeStr.trim()}:00` : timeStr.trim();
  const cleanDate = dateStr ? (dateStr.includes('T') ? dateStr.split('T')[0] : dateStr) : getSaudiTodayDate();
  const isoWithOffset = `${cleanDate}T${cleanTime}+03:00`;
  const d = new Date(isoWithOffset);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
