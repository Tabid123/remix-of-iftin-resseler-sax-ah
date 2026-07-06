// Synonym dictionary + keyword extractor for USSD dialog auto-learning
// Maps common Somali/English words used across mobile-money & airtime USSD flows.
export const SYNONYMS: Record<string, string[]> = {
  amount: ['amount', 'mount', 'lacag', 'lacagta', 'qiimo', 'qiime', 'sum', 'wadarta', 'value'],
  receiver: ['receiver', 'reciver', 'recipient', 'number', 'lambar', 'lambarka', 'raac', 'raaci', 'phone', 'telefoon', 'mobile', 'destination'],
  pin: ['pin', 'sirta', 'sir', 'furaha', 'password', 'secret', 'code'],
  send: ['send', 'dir', 'sii', 'wad', 'submit', 'ok', 'fadlan', 'geli'],
  confirm: ['confirm', 'xaqiiji', 'yes', 'haa', 'accept', 'aqbal'],
  cancel: ['cancel', 'jooji', 'no', 'maya', 'bax'],
  menu: ['select', 'menu', 'xulo', 'option', 'options', 'doorasho', 'dooro'],
  credit: ['credit', 'airtime', 'sii-jir', 'reeb'],
  balance: ['balance', 'haraaga', 'hantida'],
  data: ['data', 'internet', 'xogta', 'bundle', 'package'],
  transfer: ['transfer', 'wareejin', 'gudbi'],
  reply: ['reply', 'jawaab', 'jawaabta'],
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'in', 'on', 'at', 'to', 'for',
  'from', 'and', 'or', 'but', 'if', 'then', 'else', 'with', 'by', 'as', 'your', 'you', 'my', 'me',
  'please', 'kindly', 'fadlan', 'waan', 'ku', 'ah', 'oo', 'iyo', 'la', 'u', 'ka', 'kala',
]);

/**
 * Extract likely match-keywords from a raw USSD dialog string.
 * Returns unique, lowercased tokens (1-word + 2-word bigrams) expanded via synonym map.
 */
export function extractKeywords(dialogText: string): string[] {
  if (!dialogText) return [];
  const words = dialogText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  const unique = Array.from(new Set(words));
  const bigrams: string[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    bigrams.push(`${unique[i]} ${unique[i + 1]}`);
  }

  const all = new Set<string>([...unique, ...bigrams]);

  // Expand via synonyms — if we detect any word from a synonym group, add every synonym.
  for (const w of unique) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (key === w || syns.includes(w)) {
        syns.forEach((s) => all.add(s));
        all.add(key);
      }
    }
  }

  return Array.from(all).sort();
}

/** Simple Levenshtein-based similarity 0..1 for fallback matching. */
export function similarity(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (!s.length || !t.length) return 0;
  const dp: number[][] = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i++) dp[i][0] = i;
  for (let j = 0; j <= t.length; j++) dp[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[s.length][t.length];
  return 1 - dist / Math.max(s.length, t.length);
}