export function readUiToken(tokenName) {
  if (!String(tokenName).startsWith("--oat-")) {
    throw new TypeError(`UI token names must use the --oat- namespace: ${tokenName}`);
  }
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}
