// ================= LANGUAGE & MENU ITEM FORMATTER FOR PRINTING =================
// Rule 1: Urdu is completely removed from the entire system.
// Rule 2: USB Thermal Printer prints English + Arabic (from DB).
// Rule 3: Cloud / Network Printer prints English ONLY.

/**
 * Strips any Urdu-specific characters and known Urdu phrases
 */
export function removeUrdu(str) {
  if (!str) return '';
  let cleaned = String(str);

  // Remove known Urdu words/phrases
  const urduPhrases = [
    /اصل پرچی کاؤنٹر سے حاصل کریں۔?/g,
    /مرغ بریانی/g,
    /گارلک بریڈ/g,
    /مرغ کڑاہی/g,
    /مرغ ہانڈی/g,
    /مرغ تکہ/g,
    /مرغ بوٹی/g,
    /مرغ کباب/g,
    /سیخ کباب/g,
    /ریشمی کباب/g,
    /مرغ روسٹ/g,
    /مرغ بروسٹ/g,
    /مرغ برگر/g,
    /بیف برگر/g,
    /زنگر برگر/g,
    /مرغ شوارما/g,
    /مرغ رول/g,
    /پراٹھا رول/g,
    /فرینچ فرائز/g,
    /لوڈڈ فرائز/g,
    /چیز پیزا/g,
    /مرغ پیزا/g,
    /فجیتا پیزا/g,
    /تکہ پیزا/g,
    /بی بی کیو پیزا/g,
    /پیپرونی پیزا/g,
    /گول گپے/g,
    /منرل واٹر/g,
    /کوکا کولا/g,
    /تازہ لیمونیڈ/g,
    /مینگو سموتھی/g,
    /کولڈ ڈرنک/g,
    /کڑک چائے/g,
    /سبز چائے/g,
    /گارلک نان/g,
    /چیز نان/g,
    /مرغ ونگز/g,
    /مرغ/g
  ];

  for (const regex of urduPhrases) {
    cleaned = cleaned.replace(regex, '');
  }

  // Remove Urdu specific Unicode codepoints:
  // \u0679 (ٹ), \u067E (پ), \u0686 (چ), \u0698 (ژ), \u06AF (گ), \u06BA (ں), \u06BE (ھ), \u06C1 (ہ), \u06D2 (ے)
  cleaned = cleaned.replace(/[\u0679\u067E\u0686\u0698\u06AF\u06BA\u06BE\u06C1\u06D2]/g, '');

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts clean English-only text from a string that may contain Arabic/Urdu
 */
export function extractEnglishOnly(str) {
  if (!str) return '';
  const cleaned = removeUrdu(str);
  // Remove all Arabic & Arabic-supplement characters (\u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF, \uFB50-\uFDFF, \uFE70-\uFEFF)
  return cleaned
    .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, '')
    .replace(/\s*-\s*$/, '')
    .replace(/^\s*-\s*/, '')
    .replace(/\s*-\s*-+/g, '-')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || str.trim();
}

/**
 * Format menu item name based on printer destination:
 * - USB Printer (isUSB = true): English + Arabic (as stored in DB), Urdu completely removed.
 * - Cloud/Network Printer (isUSB = false): English ONLY, no Arabic, no Urdu.
 */
export function formatMenuItemName(rawName, isUSB = true) {
  if (!rawName) return '';
  const noUrdu = removeUrdu(rawName);

  if (!isUSB) {
    return extractEnglishOnly(noUrdu);
  }

  // USB Thermal printer: English + Arabic from database
  return noUrdu;
}

// Backward-compatible alias for existing imports
export const formatItemUrdu = (rawName, isUSB = true) => formatMenuItemName(rawName, isUSB);
