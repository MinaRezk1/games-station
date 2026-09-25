export function friendlyError(e: unknown, fallback = 'حصلت مشكلة، جرّب تاني.'): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('permission-denied')) return 'مش مسموح بالعملية دي.';
  if (code.includes('unavailable') || code.includes('network')) return 'مفيش اتصال بالإنترنت، اتأكد من النت وجرّب تاني.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'اتقفلت نافذة تسجيل الدخول قبل ما تخلص.';
  if (code.includes('popup-blocked')) return 'المتصفح منع نافذة تسجيل الدخول، اسمح بالـ popups وجرّب تاني.';
  if (code.includes('unauthorized-domain')) return 'اللينك ده مش مضاف في Authorized domains في Firebase.';
  return fallback;
}
