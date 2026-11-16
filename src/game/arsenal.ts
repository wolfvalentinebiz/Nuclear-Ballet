import type { CounterKey } from '../economy/resources';

export type ProductionTab = 'nuclear' | 'dockyard' | 'space';

export interface ProductionItem {
  id: string;
  tab: ProductionTab;
  name: string;
  yieldLabel: string;
  productionDays: number;
  techId?: string;
  counter: CounterKey;
  description: string;
  /** Nuclear yield in megatons; undefined for non-warhead production items. */
  yieldMt?: number;
  /** Maximum launch range from a nuclear launch platform. */
  rangeKm?: number;
}

export interface ProductionTabInfo {
  id: ProductionTab;
  label: string;
  factory: string;
  inventoryLabel: string;
}

export const PRODUCTION_TABS: readonly ProductionTabInfo[] = [
  {
    id: 'nuclear',
    label: 'NUCLEAR',
    factory: 'Nuclear Missile Factory',
    inventoryLabel: 'WARHEADS',
  },
  {
    id: 'dockyard',
    label: 'DOCKYARD',
    factory: 'Dockyard',
    inventoryLabel: 'HULLS',
  },
  {
    id: 'space',
    label: 'SPACE',
    factory: 'Spaceship Factory',
    inventoryLabel: 'PAYLOADS',
  },
];

export const NUCLEAR_BOMBS: readonly ProductionItem[] = [
  {
    id: 'bomb-50kt',
    tab: 'nuclear',
    name: 'Mk I',
    yieldLabel: '50 KT',
    productionDays: 1,
    techId: 'bomb-50kt',
    counter: 'nukes',
    yieldMt: 0.05,
    rangeKm: 2_500,
    description: 'The first operational fission warhead.',
  },
  {
    id: 'bomb-100kt',
    tab: 'nuclear',
    name: 'Mk II',
    yieldLabel: '100 KT',
    productionDays: 1.5,
    techId: 'bomb-100kt',
    counter: 'nukes',
    yieldMt: 0.1,
    rangeKm: 2_500,
    description: 'A boosted fission warhead with a wider fireball.',
  },
  {
    id: 'bomb-250kt',
    tab: 'nuclear',
    name: 'Mk III',
    yieldLabel: '250 KT',
    productionDays: 2,
    techId: 'bomb-250kt',
    counter: 'nukes',
    yieldMt: 0.25,
    rangeKm: 2_500,
    description: 'A compact strategic warhead.',
  },
  {
    id: 'bomb-500kt',
    tab: 'nuclear',
    name: 'Mk IV',
    yieldLabel: '500 KT',
    productionDays: 2.5,
    techId: 'bomb-500kt',
    counter: 'nukes',
    yieldMt: 0.5,
    rangeKm: 2_500,
    description: 'A high-yield fission weapon.',
  },
  {
    id: 'bomb-1mt',
    tab: 'nuclear',
    name: 'Mk V',
    yieldLabel: '1 MT',
    productionDays: 3.5,
    techId: 'bomb-1mt',
    counter: 'nukes',
    yieldMt: 1,
    rangeKm: 2_500,
    description: 'The first megaton-class thermonuclear device.',
  },
  {
    id: 'bomb-5mt',
    tab: 'nuclear',
    name: 'Mk VI',
    yieldLabel: '5 MT',
    productionDays: 5,
    techId: 'bomb-5mt',
    counter: 'icbms',
    yieldMt: 5,
    rangeKm: 12_000,
    description: 'A city-scale strategic warhead mounted on an ICBM.',
  },
  {
    id: 'bomb-10mt',
    tab: 'nuclear',
    name: 'Mk VII',
    yieldLabel: '10 MT',
    productionDays: 7,
    techId: 'bomb-10mt',
    counter: 'icbms',
    yieldMt: 10,
    rangeKm: 15_000,
    description: 'A heavy thermonuclear warhead mounted on an ICBM.',
  },
  {
    id: 'bomb-25mt',
    tab: 'nuclear',
    name: 'Mk VIII',
    yieldLabel: '25 MT',
    productionDays: 9,
    techId: 'bomb-25mt',
    counter: 'icbms',
    yieldMt: 25,
    rangeKm: 18_000,
    description: 'A multi-stage ICBM with a huge fallout footprint.',
  },
  {
    id: 'bomb-50mt',
    tab: 'nuclear',
    name: 'Mk IX',
    yieldLabel: '50 MT',
    productionDays: 12,
    techId: 'bomb-50mt',
    counter: 'icbms',
    yieldMt: 50,
    rangeKm: 20_000,
    description: 'A continental-scale ICBM.',
  },
  {
    id: 'bomb-100mt',
    tab: 'nuclear',
    name: 'Mk X',
    yieldLabel: '100 MT',
    productionDays: 16,
    techId: 'bomb-100mt',
    counter: 'icbms',
    yieldMt: 100,
    rangeKm: 20_000,
    description: 'The largest device in the arsenal, delivered by ICBM.',
  },
];

export const DOCKYARD_ITEMS: readonly ProductionItem[] = [
  {
    id: 'landing-ship',
    tab: 'dockyard',
    name: 'Landing Ship',
    yieldLabel: 'ASSAULT',
    productionDays: 2,
    counter: 'landingShips',
    description: 'A coastal assault transport for landing troops.',
  },
  {
    id: 'nuclear-submarine',
    tab: 'dockyard',
    name: 'Nuclear Submarine',
    yieldLabel: 'SSBN',
    productionDays: 5,
    counter: 'submarines',
    description: 'A long-endurance ballistic missile boat.',
  },
];

export const SPACE_ITEMS: readonly ProductionItem[] = [
  {
    id: 'rocket',
    tab: 'space',
    name: 'Rocket',
    yieldLabel: 'LAUNCH',
    productionDays: 2,
    counter: 'rockets',
    description: 'A heavy orbital launch vehicle.',
  },
  {
    id: 'recon-satellite',
    tab: 'space',
    name: 'Recon Satellite',
    yieldLabel: 'ORBIT',
    productionDays: 4,
    counter: 'satellites',
    description: 'A passive-optical reconnaissance platform.',
  },
];

export const PRODUCTION_ITEMS: readonly ProductionItem[] = [
  ...NUCLEAR_BOMBS,
  ...DOCKYARD_ITEMS,
  ...SPACE_ITEMS,
];

const itemIndex = new Map(PRODUCTION_ITEMS.map((item) => [item.id, item]));

export function productionItem(id: string): ProductionItem {
  const item = itemIndex.get(id);
  if (!item) throw new Error(`Unknown production item: ${id}`);
  return item;
}

export function itemsForTab(tab: ProductionTab): readonly ProductionItem[] {
  return PRODUCTION_ITEMS.filter((item) => item.tab === tab);
}

/** Warheads above one megaton are delivered as ICBMs. */
export function isICBM(item: ProductionItem): boolean {
  return (item.yieldMt ?? 0) > 1;
}

export function nuclearItems(): readonly ProductionItem[] {
  return NUCLEAR_BOMBS;
}

export function productionTabInfo(tab: ProductionTab): ProductionTabInfo {
  const info = PRODUCTION_TABS.find((entry) => entry.id === tab);
  if (!info) throw new Error(`Unknown production tab: ${tab}`);
  return info;
}
