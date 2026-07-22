// Free chat-message translation. Primary: MyMemory (no key, CORS-enabled);
// fallback: a public LibreTranslate instance. Results are cached in
// localStorage so repeated views of the same chat cost nothing.

const CACHE_PREFIX = 'taxipro_tr:';
const MYMEMORY = 'https://api.mymemory.translated.net/get';
const LIBRETRANSLATE = 'https://libretranslate.de/translate';

// Cheap script/diacritic-based source-language guess. It only needs to be good
// enough to build a langpair; when the guess equals the target we skip the call.
export function detectLanguage(text: string): string {
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
  return 'en';
}

function cacheKey(text: string, target: string): string {
  // djb2 — tiny stable hash to keep localStorage keys short.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${CACHE_PREFIX}${target}:${h}`;
}

async function viaMyMemory(text: string, source: string, target: string): Promise<string | null> {
  const url = `${MYMEMORY}?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    responseStatus: number;
    responseData?: { translatedText?: string };
  };
  const out = data.responseData?.translatedText;
  return data.responseStatus === 200 && out ? out : null;
}

async function viaLibreTranslate(
  text: string,
  source: string,
  target: string
): Promise<string | null> {
  const res = await fetch(LIBRETRANSLATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' }),
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
    result = await viaMyMemory(text, source, targetLang);
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
