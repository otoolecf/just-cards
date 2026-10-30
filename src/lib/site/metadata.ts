import * as env from '$env/static/public';

// Override at build time for independent installations.
const publicEnv: Record<string, string> = { ...env };
export const publicOrigin = new URL(
 publicEnv.PUBLIC_APP_URL || 'https://justcards.app'
).origin;
export const scoreTitle = 'Just Cards — Card Game Scorekeeper';
export const scoreDescription = 'Keep score for in-person card games, track rounds, and undo mistakes from your phone.';
export const playTitle = 'Just Cards — Virtual Card Tables';
export const playDescription = 'Play card games together on a virtual table. Everyone joins on their own phone, with private hands and a shared table that stays in sync.';
