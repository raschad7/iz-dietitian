/** Whether Better Auth cookies require a secure transport. */
export function shouldUseSecureAuthCookies(baseURL: string): boolean {
  return new URL(baseURL).protocol === 'https:';
}
