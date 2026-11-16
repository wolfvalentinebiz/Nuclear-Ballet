import { BUILDING_SPECS, type Building } from './buildings';

const SECONDS_PER_DAY = 86_400;
const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const deltaPhi = (lat2 - lat1) * RAD;
  const deltaLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const BASE_BUILD_DAYS = 30;
export const BUILDING_COST_COINS = 100;

export interface ConstructionOrder {
  id: number;
  building: Building;
  progressDays: number;
}

export interface ConstructionEntry {
  order: ConstructionOrder;
  name: string;
  progress: number;
  remainingDays: number;
}

/**
 * Player-owned buildings under construction. A site does not enter the active
 * building list until its construction period expires.
 */
export class ConstructionSystem {
  private orders: ConstructionOrder[] = [];
  private nextOrderId = 1;

  constructor(
    private readonly durationProvider: () => number = () => BASE_BUILD_DAYS,
  ) {}

  get durationDays(): number {
    return Math.max(1, this.durationProvider());
  }

  start(building: Building): ConstructionOrder {
    const order: ConstructionOrder = {
      id: this.nextOrderId,
      building,
      progressDays: 0,
    };
    this.nextOrderId += 1;
    this.orders.push(order);
    return order;
  }

  advance(seconds: number, nation: string | null): Building[] {
    if (!(seconds > 0) || !nation) return [];
    const days = seconds / SECONDS_PER_DAY;
    const buildDays = this.durationDays;
    const completed: ConstructionOrder[] = [];

    for (const order of this.orders) {
      if (order.building.country !== nation) continue;
      order.progressDays += days;
      if (order.progressDays + 1e-9 >= buildDays) {
        completed.push(order);
      }
    }

    if (completed.length === 0) return [];
    this.orders = this.orders.filter((order) => !completed.includes(order));
    return completed.map((order) => order.building);
  }

  /** Removes construction sites inside a blast and returns their buildings. */
  removeWithin(lat: number, lon: number, radiusKm: number): Building[] {
    const destroyed: Building[] = [];
    this.orders = this.orders.filter((order) => {
      if (distanceKm(lat, lon, order.building.lat, order.building.lon) > radiusKm) {
        return true;
      }
      destroyed.push(order.building);
      return false;
    });
    return destroyed;
  }

  view(nation: string | null): ConstructionEntry[] {
    if (!nation) return [];
    const buildDays = this.durationDays;
    return this.orders
      .filter((order) => order.building.country === nation)
      .map((order) => {
        const spec = BUILDING_SPECS.find((entry) => entry.type === order.building.type);
        return {
          order,
          name: spec?.name ?? order.building.type,
          progress: Math.min(1, order.progressDays / buildDays),
          remainingDays: Math.max(0, buildDays - order.progressDays),
        };
      });
  }

  reset(): void {
    this.orders = [];
  }
}
