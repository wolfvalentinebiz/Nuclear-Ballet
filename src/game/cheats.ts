export const CHEAT_KEYS = [
  'unlimitedMoney',
  'unlimitedResearch',
  'unlimitedManpower',
  'unlimitedNukes',
  'instantBuild',
  'infiniteInterceptors',
] as const;

export type CheatKey = (typeof CHEAT_KEYS)[number];

export type CheatFlags = Record<CheatKey, boolean>;

export function emptyCheatFlags(): CheatFlags {
  return {
    unlimitedMoney: false,
    unlimitedResearch: false,
    unlimitedManpower: false,
    unlimitedNukes: false,
    instantBuild: false,
    infiniteInterceptors: false,
  };
}
