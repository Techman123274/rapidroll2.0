export function generateClientSeed(prefix = 'client') {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}-${Date.now()}`;
}
