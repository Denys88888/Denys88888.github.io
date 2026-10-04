import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectLanguage, translateMessage } from './translateService';

// Reported from a recording: a Spanish message with no accents was guessed to
// be English, so an English-speaking driver tapping Translate was told it was
// "already in your language". Only scripts and diacritics are evidence; plain
// Latin text has to go to the provider to be identified.

const fetchMock = vi.fn();

function myMemory(body: object, status = 200) {
  return { ok: status === 200, status, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});

describe('detectLanguage', () => {
  it('does not guess a language for plain Latin text', () => {
    expect(detectLanguage('Hola, estoy en la entrada principal')).toBeNull();
    expect(detectLanguage('Waiting at the entrance')).toBeNull();
  });

  it('still recognises scripts it can be sure of', () => {
    expect(detectLanguage('Привіт, я біля входу')).toBe('uk');
    expect(detectLanguage('我在门口')).toBe('zh');
    expect(detectLanguage('मैं प्रवेश द्वार पर हूँ')).toBe('hi');
    expect(detectLanguage('ฉันอยู่ที่ทางเข้า')).toBe('th');
  });
});

describe('translateMessage', () => {
  it('translates unaccented Spanish for an English reader', async () => {
    fetchMock.mockResolvedValue(
      myMemory({ responseStatus: 200, responseData: { translatedText: "Hi, I'm at the main entrance", detectedLanguage: 'es' } })
    );

    const result = await translateMessage('Hola, estoy en la entrada principal', 'en');

    expect(result).toEqual({ status: 'translated', text: "Hi, I'm at the main entrance" });
    expect(String(fetchMock.mock.calls[0][0])).toContain('langpair=autodetect|en');
  });

  it('calls English "already in your language" for an English reader, without the fallback', async () => {
    fetchMock.mockResolvedValue(
      myMemory({ responseStatus: 403, responseData: { translatedText: 'PLEASE SELECT TWO DISTINCT LANGUAGES' } }, 403)
    );

    const result = await translateMessage('Waiting at the entrance', 'en');

    expect(result).toEqual({ status: 'same-language' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips the network entirely when the script already says it is the reader’s language', async () => {
    const result = await translateMessage('Привіт, я біля входу', 'uk-UA');

    expect(result).toEqual({ status: 'same-language' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
