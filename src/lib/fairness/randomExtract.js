export function hashToUnitInterval(hash) {
  const slice = String(hash).slice(0, 13);
  const intValue = parseInt(slice, 16);
  return intValue / 2 ** 52;
}

export function buildHashInput(serverSeed, clientSeed, nonce) {
  return `${serverSeed}:${clientSeed}:${nonce}`;
}
