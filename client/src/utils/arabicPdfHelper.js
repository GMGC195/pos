import bidiFactory from 'bidi-js';
import reshaper from 'arabic-persian-reshaper';

const bidi = bidiFactory();
const { ArabicShaper } = reshaper;

let cachedAmiriRegBase64 = null;
let cachedAmiriBoldBase64 = null;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Loads and registers Amiri-Regular and Amiri-Bold TrueType fonts into jsPDF.
 * Fonts are fetched once and cached in memory.
 */
export async function loadArabicPdfFonts(doc) {
  if (!cachedAmiriRegBase64 || !cachedAmiriBoldBase64) {
    const [regRes, boldRes] = await Promise.all([
      fetch('/Amiri-Regular.ttf'),
      fetch('/Amiri-Bold.ttf')
    ]);
    if (!regRes.ok || !boldRes.ok) {
      throw new Error(`Failed to load Arabic fonts: ${regRes.statusText} / ${boldRes.statusText}`);
    }
    const [regBuf, boldBuf] = await Promise.all([
      regRes.arrayBuffer(),
      boldRes.arrayBuffer()
    ]);
    cachedAmiriRegBase64 = arrayBufferToBase64(regBuf);
    cachedAmiriBoldBase64 = arrayBufferToBase64(boldBuf);
  }

  doc.addFileToVFS('Amiri-Regular.ttf', cachedAmiriRegBase64);
  doc.addFileToVFS('Amiri-Bold.ttf', cachedAmiriBoldBase64);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
}

/**
 * Checks whether a given string contains any Arabic characters.
 */
export function hasArabicCharacters(text) {
  if (!text) return false;
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(text));
}

/**
 * Prepares Arabic text for direct jsPDF rendering (doc.text).
 * Applies Arabic contextual shaping to Unicode Presentation Forms-B (glyphs connected)
 * while preserving natural word order for LTR flow.
 */
export function formatArabicForDocText(text) {
  if (!text) return '';
  const str = String(text);
  if (!hasArabicCharacters(str)) return str;
  return ArabicShaper.convertArabic(str);
}

/**
 * Prepares Arabic text for jsPDF AutoTable cells.
 * Applies Arabic contextual shaping and BiDi reordering so that table cell rendering
 * displays right-to-left connected Arabic characters without character reversal.
 */
export function formatArabicForTable(text) {
  if (!text) return '';
  const str = String(text);
  if (!hasArabicCharacters(str)) return str;
  const shaped = ArabicShaper.convertArabic(str);
  const embeddingLevels = bidi.getEmbeddingLevels(shaped, 'ltr');
  return bidi.getReorderedString(shaped, embeddingLevels);
}
