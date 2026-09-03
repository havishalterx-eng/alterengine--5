import { loadConfig } from '@alter/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantDataDeclarations } from '@alter/deletion-registry';
import {
  createIdentityStore,
  UnknownRoleError,
  type IdentityStore,
} from './store.js';

/**
 * Component 42 done-gate tests — Identity & Membership, against real
 * Postgres (alter_builder_a), no fixtures.
 *
 *   1. A real member with a real role resolves to a NON-EMPTY permission
 *      set — closing the previous build's critical defect, where the
 *      gateway derived roles from real queries and then set permissions to
 *      a literal empty array.
 *   2. Admin cannot perform an owner-only action.
 *   3. A custom role is invisible to another tenant.
 *   4. Removing a member immediately revokes access, verified against a
 *      live connection rather than by assertion.
 *   5. Every tenant-data table is registered with Deletion & Retention.
 */

let store: IdentityStore;
let storeReady = false;

beforeAll(async () => {
  store = createIdentityStore({ databaseUrl: loadConfig(process.env).databaseUrl });
  await store.migrate();
  storeReady = true;
});

afterAll(async () => {
  if (storeReady) await store.close();
});

const accountName = `acme-${crypto.randomUUID().slice(0, 8)}`;
const otherName = `globex-${crypto.randomUUID().slice(0, 8)}`;

describe('done gate 1 — a real member with a real role resolves to a non-empty set', () => {
  it('resolves Admin through the database, end to end', async () => {
    const account = await store.createAccount({ name: accountName, ownerEmail: `owner@${accountName}.test` });
    const member = await store.addMember({
      accountId: account.accountId,
      email: `admin@${accountName}.test`,
      role: 'Admin',
    });

    const resolved = await store.resolvePermissions({
      accountId: account.accountId,
      userId: member.userId,
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.isOwner).toBe(false);
    // The previous build's defect was exactly here: everything real, and an
    // empty permission array at the end of it.
    expect(resolved?.permissions.length).toBe(10);
    expect(resolved?.permissions).toContain('create_workflow');
    expect(resolved?.permissions).toContain('change_data_retention');
  });

  it('resolves a narrower preset to its narrower set', async () => {
    const account = await store.findAccountByName(accountName);
    if (account === null) throw new Error('account fixture missing');
    const member = await store.addMember({
      accountId: account.accountId,
      email: `viewer@${accountName}.test`,
      role: 'Viewer',
    });

    const resolved = await store.resolvePermissions({
      accountId: account.accountId,
      userId: member.userId,
    });

    expect(resolved?.permissions).toEqual(['view_workflow']);
  });

  it('resolves the account creator as owner with a day-to-day role', async () => {
    const account = await store.findAccountByName(accountName);
    if (account === null) throw new Error('account fixture missing');
    const owner = await store.findUserByEmail(`owner@${accountName}.test`);
    if (owner === null) throw new Error('owner fixture missing');

    const resolved = await store.resolvePermissions({
      accountId: account.accountId,
      userId: owner.userId,
    });

    expect(resolved?.isOwner).toBe(true);
    expect(resolved?.permissions.length).toBe(10);
  });
});

describe('done gate 2 — Admin cannot perform an owner-only action', () => {
  it('grants Admin all ten toggles and zero owner-only actions', async () => {
    const account = await store.findAccountByName(accountName);
    if (account === null) throw new Error('account fixture missing');
    const admin = await store.findUserByEmail(`admin@${accountName}.test`);
    if (admin === null) throw new Error('admin fixture missing');

    // All ten toggles — Admin is the widest role that exists.
    expect(await store.can(account.accountId, admin.userId, 'create_workflow')).toBe(true);
    expect(await store.can(account.accountId, admin.userId, 'manage_members_and_roles')).toBe(true);

    // And not one owner-only action. Owner-only is not an eleventh toggle
    // and not a predefined role; it cannot be granted through anything.
    expect(await store.can(account.accountId, admin.userId, 'manage_billing')).toBe(false);
    expect(await store.can(account.accountId, admin.userId, 'transfer_ownership')).toBe(false);
    expect(await store.can(account.accountId, admin.userId, 'delete_account')).toBe(false);
  });

  it('resolves owner-only actions only for the owner', async () => {
    const account = await store.findAccountByName(accountName);
    if (account === null) throw new Error('account fixture missing');
    const owner = await store.findUserByEmail(`owner@${accountName}.test`);
    if (owner === null) throw new Error('owner fixture missing');

    expect(await store.can(account.accountId, owner.userId, 'manage_billing')).toBe(true);
    expect(await store.can(account.accountId, owner.userId, 'delete_account')).toBe(true);
  });

  it('transfers ownership deliberately, and the old owner loses owner-only actions', async () => {
    const account = await store.createAccount({
      name: `handover-${crypto.randomUUID().slice(0, 8)}`,
      ownerEmail: `old-owner@handover.test`,
    });
    const successor = await store.addMember({
      accountId: account.accountId,
      email: `new-owner@handover.test`,
      role: 'Admin',
    });

    expect(await store.can(account.accountId, successor.userId, 'manage_billing')).toBe(false);
    await store.transferOwnership({ accountId: account.accountId, toEmail: `new-owner@handover.test` });
    expect(await store.can(account.accountId, successor.userId, 'manage_billing')).toBe(true);
  });

  it('transfer to a genuine non-member leaves the successor with functioning access (PR #7 defect)', async () => {
    // The rejected path: the successor is a real user of a DIFFERENT tenant
    // and not a member of this one at all. Before the fix, ownership moved
    // but no membership existed — resolvePermissions() returned null
    // (indistinguishable from "not a member") while can() granted
    // owner-only actions one at a time. The new owner owned an account they
    // could not use.
    const name = `rescue-${crypto.randomUUID().slice(0, 8)}`;
    const account = await store.createAccount({ name, ownerEmail: `founder@${name}.test` });
    const oldOwner = await store.findUserByEmail(`founder@${name}.test`);
    if (oldOwner === null) throw new Error('founder fixture missing');

    // The successor exists — as the owner of an unrelated tenant.
    await store.createAccount({
      name: `${name}-unrelated`,
      ownerEmail: `successor@${name}.test`,
    });

    await store.transferOwnership({
      accountId: account.accountId,
      toEmail: `successor@${name}.test`,
    });
    const successor = await store.findUserByEmail(`successor@${name}.test`);
    if (successor === null) throw new Error('successor fixture missing');

    // The exact broken assertions, now fixed: a real permission set, not
    // null, and day-to-day capability through it.
    const resolved = await store.resolvePermissions({
      accountId: account.accountId,
      userId: successor.userId,
    });
    expect(resolved).not.toBeNull();
    expect(resolved?.isOwner).toBe(true);
    expect(resolved?.permissions.length).toBe(10);
    expect(await store.can(account.accountId, successor.userId, 'create_workflow')).toBe(true);
    expect(await store.can(account.accountId, successor.userId, 'manage_billing')).toBe(true);

    // The previous owner keeps their Admin membership (deliberately not
    // removed) and loses owner-only actions.
    const oldOwnerAfter = await store.resolvePermissions({
      accountId: account.accountId,
      userId: oldOwner.userId,
    });
    expect(oldOwnerAfter?.isOwner).toBe(false);
    expect(oldOwnerAfter?.permissions.length).toBe(10);
    expect(await store.can(account.accountId, oldOwner.userId, 'manage_billing')).toBe(false);
  });

  it('transfer to a brand-new email creates the user with functioning access', async () => {
    // The other realistic transfer: the successor has never appeared in the
    // system at all.
    const name = `fresh-${crypto.randomUUID().slice(0, 8)}`;
    const account = await store.createAccount({ name, ownerEmail: `founder@${name}.test` });

    await store.transferOwnership({
      accountId: account.accountId,
      toEmail: `brand-new-person@${name}.test`,
    });
    const successor = await store.findUserByEmail(`brand-new-person@${name}.test`);
    if (successor === null) throw new Error('successor was not created');

    const resolved = await store.resolvePermissions({
      accountId: account.accountId,
      userId: successor.userId,
    });
    expect(resolved?.isOwner).toBe(true);
    expect(resolved?.permissions.length).toBe(10);
    expect(await store.can(account.accountId, successor.userId, 'create_workflow')).toBe(true);
  });
});

describe('done gate 3 — a custom role is invisible to another tenant', () => {
  it('cannot be assigned, listed, or resolved by another tenant', async () => {
    const acme = await store.createAccount({
      name: accountName + '-custom',
      ownerEmail: `owner@${accountName}-custom.test`,
    });
    await store.createCustomRole({
      accountId: acme.accountId,
      name: 'Auditor',
      toggles: ['view_workflow', 'view_billing'],
    });

    const auditor = await store.addMember({
      accountId: acme.accountId,
      email: `auditor@${accountName}-custom.test`,
      role: 'Auditor',
    });
    const resolved = await store.resolvePermissions({
      accountId: acme.accountId,
      userId: auditor.userId,
    });
    expect([...(resolved?.permissions ?? [])].sort()).toEqual(['view_billing', 'view_workflow']);

    // A different tenant cannot see it in its role list...
    const globex = await store.createAccount({
      name: otherName,
      ownerEmail: `owner@${otherName}.test`,
    });
    const globexRoles = await store.listRoles(globex.accountId);
    expect(globexRoles.map((role) => role.name)).not.toContain('Auditor');

    // ...cannot assign it...
    await expect(
      store.addMember({
        accountId: globex.accountId,
        email: `spy@${otherName}.test`,
        role: 'Auditor',
      }),
    ).rejects.toThrow(UnknownRoleError);

    // ...and even a membership row naming it resolves to nothing: the role
    // lookup is scoped to the tenant, so Globex's "Auditor" is not Acme's.
    // The row is forced with raw SQL because every managed path already
    // rejects the name — the point is that resolution cannot be fooled.
    const spy = await store.addMember({
      accountId: globex.accountId,
      email: `spy2@${otherName}.test`,
      role: 'Viewer',
    });
    const client = new Client({ connectionString: loadConfig(process.env).databaseUrl });
    await client.connect();
    try {
      await client.query('UPDATE memberships SET role_name = $1 WHERE user_id = $2', [
        'Auditor',
        spy.userId,
      ]);
    } finally {
      await client.end();
    }
    const forced = await store.resolvePermissions({
      accountId: globex.accountId,
      userId: spy.userId,
    });
    // Fail-closed: a role name that resolves to nothing grants nothing.
    expect(forced?.permissions).toEqual([]);
  });
});

describe('done gate 4 — removing a member immediately revokes access', () => {
  it('revokes on the same live connection, not by assertion', async () => {
    const account = await store.createAccount({
      name: `revoke-${crypto.randomUUID().slice(0, 8)}`,
      ownerEmail: `owner@revoke.test`,
    });
    const member = await store.addMember({
      accountId: account.accountId,
      email: `leaver@revoke.test`,
      role: 'Member',
    });

    // Live: resolved through the same persistent pool the whole suite uses.
    const before = await store.resolvePermissions({
      accountId: account.accountId,
      userId: member.userId,
    });
    expect(before?.permissions.length).toBeGreaterThan(0);

    await store.removeMember({ accountId: account.accountId, email: `leaver@revoke.test` });

    const after = await store.resolvePermissions({
      accountId: account.accountId,
      userId: member.userId,
    });
    expect(after).toBeNull();
    expect(await store.can(account.accountId, member.userId, 'view_workflow')).toBe(false);
  });

  it('propagates a role change to resolution — the driver-test half provable before component 1', async () => {
    // The contract's driver test is "a role change propagates to real
    // request-time permission resolution". Request-time enforcement is
    // component 1 (step 2); the resolution half is provable now.
    const account = await store.createAccount({
      name: `promote-${crypto.randomUUID().slice(0, 8)}`,
      ownerEmail: `owner@promote.test`,
    });
    const member = await store.addMember({
      accountId: account.accountId,
      email: `climber@promote.test`,
      role: 'Viewer',
    });

    const asViewer = await store.resolvePermissions({
      accountId: account.accountId,
      userId: member.userId,
    });
    expect(asViewer?.permissions).toEqual(['view_workflow']);

    await store.setMemberRole({
      accountId: account.accountId,
      userId: member.userId,
      role: 'Admin',
    });

    const asAdmin = await store.resolvePermissions({
      accountId: account.accountId,
      userId: member.userId,
    });
    expect(asAdmin?.permissions.length).toBe(10);
  });
});

describe('fail-closed resolution', () => {
  it('grants nothing for an unknown user, an unknown account, or a non-member', async () => {
    const account = await store.findAccountByName(accountName);
    if (account === null) throw new Error('account fixture missing');

    expect(
      await store.resolvePermissions({ accountId: account.accountId, userId: crypto.randomUUID() }),
    ).toBeNull();
    expect(
      await store.resolvePermissions({ accountId: crypto.randomUUID(), userId: crypto.randomUUID() }),
    ).toBeNull();
    const outsider = await store.createAccount({
      name: `outsider-${crypto.randomUUID().slice(0, 8)}`,
      ownerEmail: `owner@outsider.test`,
    });
    // A real user of another tenant, asking in this tenant: not a member here.
    const otherOwner = await store.findUserByEmail(`owner@${otherName}.test`);
    if (otherOwner === null) throw new Error('outsider fixture missing');
    expect(
      await store.resolvePermissions({ accountId: outsider.accountId, userId: otherOwner.userId }),
    ).toBeNull();
  });
});

describe('RLS policies exist — enforcement unproven until component 1 (step 2)', () => {
  it('accounts, memberships and custom_roles carry FORCE row-level security', async () => {
    // What IS provable today: the policies exist on the live schema with
    // FORCE. What is NOT provable, and must not be implied: that they block
    // anything — the local Postgres connects as a superuser (bypasses RLS),
    // and no per-request tenant context exists until component 1. Step 2
    // owes the enforcement proof against a non-superuser connection.
    const client = new Client({ connectionString: loadConfig(process.env).databaseUrl });
    await client.connect();
    try {
      const tables = await client.query<{
        readonly relname: string;
        readonly relrowsecurity: boolean;
        readonly relforcerowsecurity: boolean;
      }>(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname IN ('accounts', 'memberships', 'custom_roles')
         ORDER BY c.relname`,
      );
      expect(tables.rows).toEqual([
        { relname: 'accounts', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'custom_roles', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'memberships', relrowsecurity: true, relforcerowsecurity: true },
      ]);

      const policies = await client.query<{ readonly tablename: string; readonly policyname: string }>(
        `SELECT tablename, policyname FROM pg_policies
         WHERE schemaname = 'public' AND tablename IN ('accounts', 'memberships', 'custom_roles')
         ORDER BY tablename`,
      );
      expect(policies.rows.map((row) => row.tablename)).toEqual([
        'accounts',
        'custom_roles',
        'memberships',
      ]);
      for (const row of policies.rows) expect(row.policyname).toBe('tenant_isolation');
    } finally {
      await client.end();
    }
  });
});

describe('done gate 5 — registered with Deletion & Retention', () => {
  it('declares every tenant-data table this component owns', () => {
    const declared = new Set(
      tenantDataDeclarations
        .filter((entry) => entry.component === 42)
        .map((entry) => entry.table),
    );
    // Every table created by this component's migration that carries tenant
    // or member data. The deletion-schema gate joins this against the live
    // schema, so a missing entry fails the build, not a review.
    for (const table of ['accounts', 'users', 'memberships', 'custom_roles']) {
      expect(declared.has(table), `${table} must be declared`).toBe(true);
    }
  });
});
