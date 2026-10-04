/** Parse a literal unicast address without browser URL normalization accepting numeric aliases. */
export function parseLaptopHost(input: string): { host: string; ipv6: boolean } | null {
  if (!input.includes(':')) {
    const parts = input.split('.');
    if (
      parts.length !== 4 ||
      parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
    )
      return null;
    const first = Number(parts[0]);
    return first === 0 || first === 127 || first >= 224 ? null : { host: input, ipv6: false };
  }
  const scoped = input.split('%25');
  if (scoped.length > 2 || (scoped[1] !== undefined && !/^[A-Za-z0-9_.-]{1,32}$/.test(scoped[1])))
    return null;
  let literal = scoped[0]!;
  if (literal.includes('.')) {
    const at = literal.lastIndexOf(':');
    const parts = literal.slice(at + 1).split('.');
    if (
      parts.length !== 4 ||
      parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
    )
      return null;
    const values = parts.map(Number);
    literal =
      literal.slice(0, at + 1) +
      ((values[0]! << 8) | values[1]!).toString(16) +
      ':' +
      ((values[2]! << 8) | values[3]!).toString(16);
  }
  if (!/^[0-9a-fA-F:]+$/.test(literal)) return null;
  const halves = literal.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1) ||
    [...left, ...right].some((word) => !/^[0-9a-fA-F]{1,4}$/.test(word))
  )
    return null;
  const words = [...left, ...Array(missing).fill('0'), ...right].map((word) => parseInt(word, 16));
  if (
    (words[0]! & 0xff00) === 0xff00 ||
    words.slice(0, 6).every((word) => word === 0) ||
    (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff)
  )
    return null;
  if (scoped[1] !== undefined && (words[0]! & 0xffc0) !== 0xfe80) return null;
  let bestStart = -1,
    bestLength = 1;
  for (let start = 0; start < words.length;) {
    if (words[start] !== 0) {
      start++;
      continue;
    }
    let end = start;
    while (words[end] === 0 && end < words.length) end++;
    if (end - start > bestLength) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  const hex = words.map((word) => word.toString(16));
  const host =
    bestStart < 0
      ? hex.join(':')
      : hex.slice(0, bestStart).join(':') + '::' + hex.slice(bestStart + bestLength).join(':');
  return { host: host + (scoped[1] === undefined ? '' : `%25${scoped[1]}`), ipv6: true };
}
