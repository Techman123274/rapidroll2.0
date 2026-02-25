export function nextNonce(current = 0) {
  return Number(current || 0) + 1;
}
