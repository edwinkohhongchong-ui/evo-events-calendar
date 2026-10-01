// Constant-time string comparison that also works in the Edge runtime
// (middleware can't use crypto.timingSafeEqual). The loop always runs over the
// longer length, so timing doesn't reveal where the first mismatch is.
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
