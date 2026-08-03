type SocialSignInResult = { error?: unknown };

/** Converts transport/provider failures into a renderable state for the button. */
export async function attemptGoogleSignIn(start: () => Promise<SocialSignInResult>): Promise<boolean> {
  try {
    const result = await start();
    return !result.error;
  } catch {
    return false;
  }
}
