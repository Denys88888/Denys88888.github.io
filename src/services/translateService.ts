// Free chat-message translation. Primary: MyMemory (no key, CORS-enabled);
// fallback: a public LibreTranslate instance. Results are cached in
// localStorage so repeated views of the same chat cost nothing.

const CACHE_PREFIX = 'taxipro_tr:';
const MYMEMORY = 'https://api.mymemory.translated.net/get';
const LIBRETRANSLATE = 'https://libretranslate.de/translate';

// Cheap script/diacritic-based source-language guess, or null when the text
// gives no reliable clue. Plain Latin text could be English, Spanish, Italian,
// Indonesian, Dutch… — guessing "en" for all of it told an English-speaking
// driver that "Hola, estoy en la entrada principal" was already in their
// language. With no guess, the provider detects the language itself.
export function detectLanguage(text: string): string | null {
  if (/[Ѐ-ӿ]/.test(text)) {
    return /[іїєґІЇЄҐ]/.test(text) ? 'uk' : 'ru';
  }
  if (/[ąćęłńóśźżĄĆĘŁŃŚŹŻ]/.test(text)) return 'pl';
  if (/[äöüßÄÖÜ]/.test(text)) return 'de';
  if (/[àâçéèêëîïôùûÀÂÇÉÈÊ]/.test(text)) return 'fr';
  if (/[áéíóúñ¿¡]/.test(text)) return 'es';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/[฀-๿]/.test(text)) return 'th';
  return null;
}

function cacheKey(text: string, target: string): string {
  // djb2 — tiny stable hash to keep localStorage keys short.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${CACHE_PREFIX}${target}:${h}`;
}

/** Same-language is an answer, not a failure: it must not fall through to the fallback. */
const SAME = Symbol('same-language');

async function viaMyMemory(
  text: string,
  source: string | null,
  target: string
): Promise<string | typeof SAME | null> {
  const url = `${MYMEMORY}?q=${encodeURIComponent(text)}&langpair=${source ?? 'autodetect'}|${target}`;
  const res = await fetch(url);
  // Autodetect landing on the reader's own language comes back as a 403 with
  // this text in place of a translation.
  const data = (await res.json().catch(() => null)) as {
    responseStatus: number;
    responseData?: { translatedText?: string; detectedLanguage?: string };
  } | null;
  if (!data) return null;
  const out = data.responseData?.translatedText;
  if (/two distinct languages/i.test(out ?? '')) return SAME;
  if (data.responseData?.detectedLanguage?.slice(0, 2).toLowerCase() === target) return SAME;
  return res.ok && data.responseStatus === 200 && out ? out : null;
}

async function viaLibreTranslate(
  text: string,
  source: string | null,
  target: string
): Promise<string | null> {
  const res = await fetch(LIBRETRANSLATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: source ?? 'auto', target, format: 'text' }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { translatedText?: string };
  return data.translatedText ?? null;
}

export type TranslateResult =
  | { status: 'translated'; text: string }
  | { status: 'same-language' }
  | { status: 'error' };

// Translate into the receiver's language. Distinguishes "already in your
// language" (no call made, not an error) from a genuine provider failure —
// callers should render these two cases differently.
export async function translateMessage(text: string, target: string): Promise<TranslateResult> {
  const targetLang = target.slice(0, 2).toLowerCase();
  const source = detectLanguage(text);
  if (source === targetLang) return { status: 'same-language' };

  const key = cacheKey(text, targetLang);
  try {
    const cached = localStorage.getItem(key);
    if (cached) return { status: 'translated', text: cached };
  } catch { /* ignore */ }

  let result: string | null = null;
  try {
    const mm = await viaMyMemory(text, source, targetLang);
    if (mm === SAME) return { status: 'same-language' };
    result = mm;
  } catch {
    result = null;
  }
  if (!result) {
    try {
      result = await viaLibreTranslate(text, source, targetLang);
    } catch {
      result = null;
    }
  }
  if (result && result.trim() && result.trim().toLowerCase() !== text.trim().toLowerCase()) {
    try { localStorage.setItem(key, result); } catch { /* ignore */ }
    return { status: 'translated', text: result };
  }
  return { status: 'error' };
}
