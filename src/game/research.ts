export type TechBranch =
  | 'arsenal'
  | 'launch'
  | 'gbi'
  | 'lethality'
  | 'deployment'
  | 'recruitment'
  | 'construction';

export const BASE_LAUNCH_COOLDOWN_HOURS = 4;

export interface TechDefinition {
  id: string;
  branch: TechBranch;
  name: string;
  description: string;
  cost: number;
  requires: string | null;
  unlocksItemId?: string;
}

export interface TechBranchInfo {
  id: TechBranch;
  name: string;
  shortName: string;
}

export const TECH_BRANCHES: readonly TechBranchInfo[] = [
  { id: 'arsenal', name: 'NUCLEAR ARSENAL', shortName: 'ARSENAL' },
  { id: 'launch', name: 'LAUNCH SYSTEMS', shortName: 'LAUNCH' },
  { id: 'gbi', name: 'MISSILE DEFENSE', shortName: 'DEFENSE' },
  { id: 'lethality', name: 'TROOP LETHALITY', shortName: 'LETHALITY' },
  { id: 'deployment', name: 'TROOP DEPLOYMENT', shortName: 'DEPLOYMENT' },
  { id: 'recruitment', name: 'RECRUITMENT', shortName: 'RECRUITMENT' },
  { id: 'construction', name: 'CONSTRUCTION', shortName: 'CONSTRUCTION' },
];

const bombTechs: readonly TechDefinition[] = [
  {
    id: 'bomb-50kt',
    branch: 'arsenal',
    name: 'Mk I · 50 kt',
    description: 'Unlocks the 50 kt fission warhead for production.',
    cost: 20,
    requires: null,
    unlocksItemId: 'bomb-50kt',
  },
  {
    id: 'bomb-100kt',
    branch: 'arsenal',
    name: 'Mk II · 100 kt',
    description: 'Unlocks the boosted 100 kt warhead.',
    cost: 35,
    requires: 'bomb-50kt',
    unlocksItemId: 'bomb-100kt',
  },
  {
    id: 'bomb-250kt',
    branch: 'arsenal',
    name: 'Mk III · 250 kt',
    description: 'Unlocks the compact 250 kt strategic warhead.',
    cost: 60,
    requires: 'bomb-100kt',
    unlocksItemId: 'bomb-250kt',
  },
  {
    id: 'bomb-500kt',
    branch: 'arsenal',
    name: 'Mk IV · 500 kt',
    description: 'Unlocks the 500 kt high-yield warhead.',
    cost: 100,
    requires: 'bomb-250kt',
    unlocksItemId: 'bomb-500kt',
  },
  {
    id: 'bomb-1mt',
    branch: 'arsenal',
    name: 'Mk V · 1 Mt',
    description: 'Unlocks the first megaton thermonuclear warhead.',
    cost: 160,
    requires: 'bomb-500kt',
    unlocksItemId: 'bomb-1mt',
  },
  {
    id: 'bomb-5mt',
    branch: 'arsenal',
    name: 'Mk VI · 5 Mt',
    description: 'Unlocks a city-scale strategic warhead.',
    cost: 260,
    requires: 'bomb-1mt',
    unlocksItemId: 'bomb-5mt',
  },
  {
    id: 'bomb-10mt',
    branch: 'arsenal',
    name: 'Mk VII · 10 Mt',
    description: 'Unlocks a heavy thermonuclear warhead.',
    cost: 420,
    requires: 'bomb-5mt',
    unlocksItemId: 'bomb-10mt',
  },
  {
    id: 'bomb-25mt',
    branch: 'arsenal',
    name: 'Mk VIII · 25 Mt',
    description: 'Unlocks the 25 Mt multi-stage weapon.',
    cost: 680,
    requires: 'bomb-10mt',
    unlocksItemId: 'bomb-25mt',
  },
  {
    id: 'bomb-50mt',
    branch: 'arsenal',
    name: 'Mk IX · 50 Mt',
    description: 'Unlocks the 50 Mt continental-scale device.',
    cost: 1_100,
    requires: 'bomb-25mt',
    unlocksItemId: 'bomb-50mt',
  },
  {
    id: 'bomb-100mt',
    branch: 'arsenal',
    name: 'Mk X · 100 Mt',
    description: 'Unlocks the largest device in the arsenal.',
    cost: 1_800,
    requires: 'bomb-50mt',
    unlocksItemId: 'bomb-100mt',
  },
];

const launchTechs: readonly TechDefinition[] = [
  {
    id: 'launch-1',
    branch: 'launch',
    name: 'RAPID LAUNCH I',
    description: 'Cuts launch-platform turnaround from 4 hours to 3 hours.',
    cost: 220,
    requires: null,
  },
  {
    id: 'launch-2',
    branch: 'launch',
    name: 'RAPID LAUNCH II',
    description: 'Cuts launch-platform turnaround from 3 hours to 2 hours.',
    cost: 420,
    requires: 'launch-1',
  },
  {
    id: 'launch-3',
    branch: 'launch',
    name: 'RAPID LAUNCH III',
    description: 'Cuts launch-platform turnaround from 2 hours to 1 hour.',
    cost: 700,
    requires: 'launch-2',
  },
];

const gbiTechs: readonly TechDefinition[] = [
  {
    id: 'gbi-1',
    branch: 'gbi',
    name: 'GBI ENVELOPE I',
    description: 'Extends the base GBI coverage from 25% to 50%.',
    cost: 300,
    requires: null,
  },
  {
    id: 'gbi-2',
    branch: 'gbi',
    name: 'GBI ENVELOPE II',
    description: 'Extends interceptor coverage from 50% to 75%.',
    cost: 600,
    requires: 'gbi-1',
  },
  {
    id: 'gbi-3',
    branch: 'gbi',
    name: 'GBI ENVELOPE III',
    description: 'Extends interceptor coverage from 75% to the full 5,300 km range.',
    cost: 1_200,
    requires: 'gbi-2',
  },
];

const lethalityTechs: readonly TechDefinition[] = [
  {
    id: 'lethality-1',
    branch: 'lethality',
    name: 'MARKSMANSHIP I',
    description: 'Increases troop lethality by 10%.',
    cost: 120,
    requires: null,
  },
  {
    id: 'lethality-2',
    branch: 'lethality',
    name: 'MARKSMANSHIP II',
    description: 'Increases troop lethality by another 10%.',
    cost: 200,
    requires: 'lethality-1',
  },
  {
    id: 'lethality-3',
    branch: 'lethality',
    name: 'MARKSMANSHIP III',
    description: 'Increases troop lethality by another 10%.',
    cost: 320,
    requires: 'lethality-2',
  },
  {
    id: 'lethality-4',
    branch: 'lethality',
    name: 'MARKSMANSHIP IV',
    description: 'Increases troop lethality by another 10%.',
    cost: 500,
    requires: 'lethality-3',
  },
  {
    id: 'lethality-5',
    branch: 'lethality',
    name: 'MARKSMANSHIP V',
    description: 'Increases troop lethality by another 10%.',
    cost: 800,
    requires: 'lethality-4',
  },
];

const deploymentTechs: readonly TechDefinition[] = [
  {
    id: 'deployment-1',
    branch: 'deployment',
    name: 'MOBILIZATION I',
    description: 'Increases the daily troop deployment cap by 25%.',
    cost: 100,
    requires: null,
  },
  {
    id: 'deployment-2',
    branch: 'deployment',
    name: 'MOBILIZATION II',
    description: 'Increases the daily troop deployment cap by another 25%.',
    cost: 180,
    requires: 'deployment-1',
  },
  {
    id: 'deployment-3',
    branch: 'deployment',
    name: 'MOBILIZATION III',
    description: 'Increases the daily troop deployment cap by another 25%.',
    cost: 300,
    requires: 'deployment-2',
  },
  {
    id: 'deployment-4',
    branch: 'deployment',
    name: 'MOBILIZATION IV',
    description: 'Increases the daily troop deployment cap by another 25%.',
    cost: 480,
    requires: 'deployment-3',
  },
  {
    id: 'deployment-5',
    branch: 'deployment',
    name: 'MOBILIZATION V',
    description: 'Increases the daily troop deployment cap by another 25%.',
    cost: 760,
    requires: 'deployment-4',
  },
];

const recruitmentTechs: readonly TechDefinition[] = [
  {
    id: 'recruitment-1',
    branch: 'recruitment',
    name: 'RECRUITMENT I',
    description: 'Increases daily barracks recruitment by 25%.',
    cost: 120,
    requires: null,
  },
  {
    id: 'recruitment-2',
    branch: 'recruitment',
    name: 'RECRUITMENT II',
    description: 'Increases daily barracks recruitment by another 25%.',
    cost: 200,
    requires: 'recruitment-1',
  },
  {
    id: 'recruitment-3',
    branch: 'recruitment',
    name: 'RECRUITMENT III',
    description: 'Increases daily barracks recruitment by another 25%.',
    cost: 320,
    requires: 'recruitment-2',
  },
  {
    id: 'recruitment-4',
    branch: 'recruitment',
    name: 'RECRUITMENT IV',
    description: 'Increases daily barracks recruitment by another 25%.',
    cost: 500,
    requires: 'recruitment-3',
  },
  {
    id: 'recruitment-5',
    branch: 'recruitment',
    name: 'RECRUITMENT V',
    description: 'Increases daily barracks recruitment by another 25%.',
    cost: 800,
    requires: 'recruitment-4',
  },
];

const constructionTechs: readonly TechDefinition[] = [
  {
    id: 'construction-1',
    branch: 'construction',
    name: 'CONSTRUCTION I',
    description: 'Reduces building construction time by 10%.',
    cost: 150,
    requires: null,
  },
  {
    id: 'construction-2',
    branch: 'construction',
    name: 'CONSTRUCTION II',
    description: 'Reduces building construction time by another 10%.',
    cost: 250,
    requires: 'construction-1',
  },
  {
    id: 'construction-3',
    branch: 'construction',
    name: 'CONSTRUCTION III',
    description: 'Reduces building construction time by another 10%.',
    cost: 400,
    requires: 'construction-2',
  },
  {
    id: 'construction-4',
    branch: 'construction',
    name: 'CONSTRUCTION IV',
    description: 'Reduces building construction time by another 10%.',
    cost: 650,
    requires: 'construction-3',
  },
  {
    id: 'construction-5',
    branch: 'construction',
    name: 'CONSTRUCTION V',
    description: 'Reduces building construction time by another 10%.',
    cost: 1_000,
    requires: 'construction-4',
  },
];

export const TECHS: readonly TechDefinition[] = [
  ...bombTechs,
  ...launchTechs,
  ...gbiTechs,
  ...lethalityTechs,
  ...deploymentTechs,
  ...recruitmentTechs,
  ...constructionTechs,
];

const techIndex = new Map(TECHS.map((tech) => [tech.id, tech]));
export const BASE_GBI_FRACTION = 0.25;

export function techDefinition(id: string): TechDefinition {
  const tech = techIndex.get(id);
  if (!tech) throw new Error(`Unknown technology: ${id}`);
  return tech;
}

export function techsForBranch(branch: TechBranch): readonly TechDefinition[] {
  return TECHS.filter((tech) => tech.branch === branch);
}

/**
 * Player-side research progression. The UI checks costs against the ledger;
 * this state only owns unlocks and their derived multipliers.
 */
export class ResearchState {
  private readonly unlocked = new Set<string>();

  isUnlocked(id: string | undefined): boolean {
    return id ? this.unlocked.has(id) : true;
  }

  isAvailable(id: string): boolean {
    if (this.unlocked.has(id)) return false;
    const tech = techDefinition(id);
    return tech.requires === null || this.unlocked.has(tech.requires);
  }

  unlock(id: string): void {
    if (!this.isAvailable(id)) {
      throw new Error(`Technology is not available: ${id}`);
    }
    this.unlocked.add(id);
  }

  count(branch: TechBranch): number {
    let total = 0;
    for (const tech of this.unlocked) {
      if (techDefinition(tech).branch === branch) total += 1;
    }
    return total;
  }

  gbiFraction(): number {
    return Math.min(1, BASE_GBI_FRACTION + this.count('gbi') * 0.25);
  }

  launchCooldownHours(): number {
    return Math.max(1, BASE_LAUNCH_COOLDOWN_HOURS - this.count('launch'));
  }

  troopLethality(): number {
    return 1 + 0.1 * this.count('lethality');
  }

  deploymentMultiplier(): number {
    return 1 + 0.25 * this.count('deployment');
  }

  recruitmentMultiplier(): number {
    return 1 + 0.25 * this.count('recruitment');
  }

  constructionTimeMultiplier(): number {
    return Math.max(0.5, 1 - 0.1 * this.count('construction'));
  }

  unlockedIds(): readonly string[] {
    return [...this.unlocked];
  }
}
