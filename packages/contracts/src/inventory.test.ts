import { describe, expect, it } from 'vitest';
import {
  InventoryCoverageError,
  assertInventoryCovers,
  buildInventory,
} from './inventory.js';
import { registry } from './registry.js';

const inventory = buildInventory(registry);

describe('done gate 6 — the inventory lists every declared capability with an accurate status', () => {
  it('covers every operation in the registry', () => {
    expect(inventory.total).toBe(Object.keys(registry).length);
    expect(inventory.entries).toHaveLength(inventory.total);
  });

  it('reports the status the registry actually declares', () => {
    const byCapability = new Map(
      inventory.entries.map((entry) => [entry.capability, entry]),
    );

    expect(byCapability.get('platform.health')?.status).toBe('implemented');
    expect(byCapability.get('workspace.listWorkflows')?.status).toBe(
      'unimplemented',
    );
    expect(byCapability.get('billing.getSubscription')?.status).toBe('deferred');
  });

  it('gives every absent capability a tracking reference, and no implemented one', () => {
    for (const entry of inventory.entries) {
      if (entry.status === 'implemented') {
        expect(entry.trackingReference).toBeNull();
      } else {
        expect(entry.trackingReference).toBeTruthy();
      }
    }
  });

  it('counts add up to the total', () => {
    const { implemented, unimplemented, deferred } = inventory.counts;
    expect(implemented + unimplemented + deferred).toBe(inventory.total);
  });

  it('is generated from the registry, not hand-maintained', () => {
    expect(inventory.generatedFrom).toBe('registry');
  });

  it('is stably ordered, so a diff shows real change rather than reordering', () => {
    const names = inventory.entries.map((entry) => entry.operation);
    expect(names).toEqual([...names].sort());
  });
});

describe('a capability in code but absent from the inventory fails', () => {
  it('passes when code declares only known capabilities', () => {
    expect(() =>
      assertInventoryCovers(inventory, ['platform.health']),
    ).not.toThrow();
  });

  it('fails when code serves something the inventory has never heard of', () => {
    // This is the twenty-admin-modules case: real capabilities attached by a
    // mechanism the sweep did not know about, invisible to everyone reading
    // the inventory afterwards.
    expect(() =>
      assertInventoryCovers(inventory, ['platform.health', 'admin.hiddenModule']),
    ).toThrow(InventoryCoverageError);

    expect(() =>
      assertInventoryCovers(inventory, ['admin.hiddenModule']),
    ).toThrow(/admin\.hiddenModule/);
  });
});
