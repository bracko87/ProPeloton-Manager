/**
 * Coins is the game's proper currency name. It must never be translated,
 * pluralized by locale, or declined with Serbian/Croatian suffixes.
 *
 * Apply once to all non-English i18next locale bundles before initialization.
 * English remains the canonical source language.
 */
const CURRENCY_WORDS: Record<string, RegExp[]> = {
  'sr-Latn': [/novčić(?:ima|em|a|e|u|i)?/giu, /novcic(?:ima|em|a|e|u|i)?/giu],
  hr: [/novčić(?:ima|em|a|e|u|i)?/giu, /novcic(?:ima|em|a|e|u|i)?/giu, /kovanic(?:ama|om|a|e|u|i)?/giu],
  de: [/Münz(?:en|e)/giu],
  es: [/monedas?/giu],
  it: [/monet[ae]/giu],
  fr: [/jetons?/giu],
  ru: [/монет(?!изац)(?:ами|ах|ой|ою|ы|а|е|у)?/giu],
}

function replaceFullWords(value: string, expression: RegExp): string {
  return value.replace(expression, (word: string, index: number, input: string) => {
    const before = input.slice(0, index)
    const after = input.slice(index + word.length)
    if (/[\p{L}\p{N}]/u.test(before.slice(-1)) || /[\p{L}\p{N}]/u.test(after.slice(0, 1))) {
      return word
    }
    return 'Coins'
  })
}

function normalizeText(text: string, locale: string, keyPath: string): string {
  let result = text
  for (const expression of CURRENCY_WORDS[locale] ?? []) {
    result = replaceFullWords(result, expression)
  }

  // Existing borrowed "coin" labels and Serbian inflections of the English word.
  result = replaceFullWords(result, /coins?(?:-(?:a|u|ima|om|ov|ova))?/giu)

  // French "pièces" can mean spare parts. Only normalize when referring
  // to money in a currency-related key or immediately following a quantity.
  if (locale === 'fr') {
    const currencyKey = /coin|reward|curren|purchase|price|package|wallet|premium|activat|renew|billing|cost|service|transfer|payment/i.test(keyPath)
    if (currencyKey) result = replaceFullWords(result, /pièces?/giu)
    else {
      result = result.replace(/(\d+\s+)pièces?\b/giu, '$1Coins')
      // Explicit payment contexts, but never equipment spare parts.
      if (/\b(payer|paiement|coût|dépenser|gagner|récompense|solde|acheter)\b/i.test(result)) {
        result = replaceFullWords(result, /pièces?/giu)
      }
    }
  }
  return result
}

function normalizeNode(node: unknown, locale: string, path: string): unknown {
  if (typeof node === 'string') return normalizeText(node, locale, path)
  if (Array.isArray(node)) return node.map((v, i) => normalizeNode(v, locale, path + '.' + i))
  if (node && typeof node === 'object') {
    const values = node as Record<string, unknown>
    for (const key of Object.keys(values)) {
      values[key] = normalizeNode(values[key], locale, path + '.' + key)
    }
  }
  return node
}

export function enforceCoinsCurrencyName(localeBundles: Record<string, unknown>): void {
  for (const locale of Object.keys(CURRENCY_WORDS)) {
    normalizeNode(localeBundles[locale], locale, locale)
  }
}
