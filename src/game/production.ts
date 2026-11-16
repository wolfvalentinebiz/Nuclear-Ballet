import type { Building, BuildingType } from './buildings';
import {
  productionItem,
  type ProductionItem,
  type ProductionTab,
} from './arsenal';
import type { ResourceLedger } from '../economy/resources';

const SECONDS_PER_DAY = 86_400;

const FACTORY_TYPE: Record<ProductionTab, BuildingType> = {
  nuclear: 'nuclearMissileFactory',
  dockyard: 'dockyard',
  space: 'spaceshipFactory',
};

export interface ProductionOrder {
  id: number;
  itemId: string;
  factoryId: string | null;
  progressDays: number;
  /** When true, completion immediately restarts the same order. */
  repeat: boolean;
}

export interface ProductionQueueEntry {
  order: ProductionOrder;
  item: ProductionItem;
  progress: number;
  active: boolean;
  remainingDays: number;
}

export interface ProductionQueueView {
  entries: ProductionQueueEntry[];
  factoryCount: number;
  activeCount: number;
}

export type EnqueueResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Per-tab production queues. Every completed order occupies one matching
 * factory; additional factories work on additional orders in parallel.
 */
export class ProductionSystem {
  private readonly queues: Record<ProductionTab, ProductionOrder[]> = {
    nuclear: [],
    dockyard: [],
    space: [],
  };
  private readonly factoryCounts: Record<ProductionTab, number> = {
    nuclear: 0,
    dockyard: 0,
    space: 0,
  };
  private nextOrderId = 1;
  /** Newly completed munitions, tracked per exact production item. */
  private readonly completedCounts = new Map<string, number>();

  constructor(
    private readonly ledger: ResourceLedger,
    private readonly isUnlocked: (techId: string | undefined) => boolean,
  ) {}

  enqueue(tab: ProductionTab, itemId: string): EnqueueResult {
    const item = productionItem(itemId);
    if (item.tab !== tab) return { ok: false, message: 'WRONG PRODUCTION LINE' };
    if (item.techId && !this.isUnlocked(item.techId)) {
      return { ok: false, message: 'RESEARCH REQUIRED' };
    }

    this.queues[tab].push({
      id: this.nextOrderId,
      itemId,
      factoryId: null,
      progressDays: 0,
      repeat: false,
    });
    this.nextOrderId += 1;
    return { ok: true };
  }

  advance(seconds: number, buildings: readonly Building[], nation: string | null): void {
    if (!(seconds > 0) || !nation) return;
    const days = seconds / SECONDS_PER_DAY;

    for (const tab of ['nuclear', 'dockyard', 'space'] as const) {
      this.advanceTab(tab, days, buildings, nation);
    }
  }

  private advanceTab(
    tab: ProductionTab,
    days: number,
    buildings: readonly Building[],
    nation: string,
  ): void {
    const factoryType = FACTORY_TYPE[tab];
    const factories = buildings
      .filter((building) => building.country === nation && building.type === factoryType)
      .map((building) => building.id);
    const factorySet = new Set(factories);
    this.factoryCounts[tab] = factories.length;

    const orders = this.queues[tab];
    const used = new Set<string>();

    for (const order of orders) {
      if (order.factoryId && factorySet.has(order.factoryId) && !used.has(order.factoryId)) {
        used.add(order.factoryId);
      } else {
        order.factoryId = null;
      }
    }

    const free = factories.filter((factoryId) => !used.has(factoryId));
    const completed: ProductionOrder[] = [];

    for (const order of orders) {
      if (!order.factoryId) {
        const factoryId = free.shift();
        if (!factoryId) continue;
        order.factoryId = factoryId;
      }

      const item = productionItem(order.itemId);
      order.progressDays += days;
      if (order.progressDays + 1e-9 >= item.productionDays) {
        this.ledger.addCounter(nation, item.counter, 1);
        this.completedCounts.set(
          order.itemId,
          (this.completedCounts.get(order.itemId) ?? 0) + 1,
        );
        if (order.repeat) {
          // Keep the factory hot and restart the cycle in place.
          order.progressDays = 0;
        } else {
          completed.push(order);
        }
      }
    }

    if (completed.length > 0) {
      this.queues[tab] = orders.filter((order) => !completed.includes(order));
    }
  }

  setRepeat(orderId: number, repeat: boolean): void {
    for (const orders of Object.values(this.queues)) {
      const order = orders.find((entry) => entry.id === orderId);
      if (order) {
        order.repeat = repeat;
        return;
      }
    }
  }

  /** Completed units of one exact item, independent of the ledger's grouped counters. */
  itemCount(itemId: string): number {
    return this.completedCounts.get(itemId) ?? 0;
  }

  consumeItem(itemId: string, amount = 1): boolean {
    const count = this.completedCounts.get(itemId) ?? 0;
    if (count + 1e-9 < amount) return false;
    this.completedCounts.set(itemId, count - amount);
    return true;
  }

  refundItem(itemId: string, amount = 1): void {
    this.completedCounts.set(
      itemId,
      (this.completedCounts.get(itemId) ?? 0) + amount,
    );
  }

  queueView(tab: ProductionTab): ProductionQueueView {
    const entries = this.queues[tab].map((order) => {
      const item = productionItem(order.itemId);
      return {
        order,
        item,
        progress: Math.min(1, order.progressDays / item.productionDays),
        active: order.factoryId !== null,
        remainingDays: Math.max(0, item.productionDays - order.progressDays),
      };
    });

    return {
      entries,
      factoryCount: this.factoryCounts[tab],
      activeCount: entries.filter((entry) => entry.active).length,
    };
  }

  queuedCount(tab: ProductionTab): number {
    return this.queues[tab].length;
  }
}
