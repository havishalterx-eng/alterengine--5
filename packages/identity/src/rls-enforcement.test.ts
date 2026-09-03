import { loadConfig } from '@alter/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIdentityStore, type IdentityStore } from './store.js';

const config = loadConfig(process.env);
let adminStore: IdentityStore;

beforeAll(async () => {
  adminStore = createIdentityStore({ databaseUrl: config.databaseUrl });
  await adminStore.migrate();
});

afterAll(async () => {
  await adminStore.close();
});

describe('RLS enforcement — Component 42 uses transaction-local tenant context', () => {
  it('allows scoped account operations and cannot leak context between pooled requests', async () => {
    const roleName = `alter_identity_rls_${crypto.randomUUID().replaceAll('-', '')}`;
    const password = crypto.randomUUID();
    const admin = new Client({ connectionString: config.databaseUrl });
    await admin.connect();

    try {
      await admin.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
      await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON accounts, memberships, custom_roles TO ' + roleName);
      await admin.query('GRANT SELECT, INSERT ON users TO ' + roleName);
      const url = new URL(config.databaseUrl);
      url.username = roleName;
      url.password = password;
      const store = createIdentityStore({ databaseUrl: url.toString() });

      try {
        const tag = crypto.randomUUID().slice(0, 8);
        const tenantA = await store.createAccount({
          name: `rls-a-${tag}`,
          ownerEmail: `owner-a-${tag}@alter.test`,
        });
        const tenantB = await store.createAccount({
          name: `rls-b-${tag}`,
          ownerEmail: `owner-b-${tag}@alter.test`,
        });
        const member = await store.addMember({
          accountId: tenantA.accountId,
          email: `member-${tag}@alter.test`,
          role: 'Member',
        });
        await store.createCustomRole({
          accountId: tenantA.accountId,
          name: `Scoped-${tag}`,
          toggles: ['view_workflow'],
        });
        await store.setMemberRole({
          accountId: tenantA.accountId,
          userId: member.userId,
          role: `Scoped-${tag}`,
        });
        expect((await store.listRoles(tenantA.accountId)).map((role) => role.name)).toContain(`Scoped-${tag}`);
        expect(await store.can(tenantA.accountId, member.userId, 'view_workflow')).toBe(true);

        const successor = await store.addMember({
          accountId: tenantA.accountId,
          email: `successor-${tag}@alter.test`,
          role: 'Admin',
        });
        await store.transferOwnership({ accountId: tenantA.accountId, toEmail: successor.email });

        const [resolvedA, resolvedB] = await Promise.all([
          store.resolvePermissions({ accountId: tenantA.accountId, userId: member.userId }),
          store.resolvePermissions({ accountId: tenantB.accountId, userId: member.userId }),
        ]);
        expect(resolvedA?.permissions).toEqual(['view_workflow']);
        expect(resolvedB).toBeNull();
        await store.removeMember({ accountId: tenantA.accountId, email: member.email });
        expect(await store.resolvePermissions({ accountId: tenantA.accountId, userId: member.userId })).toBeNull();

        const direct = new Client({ connectionString: url.toString() });
        await direct.connect();
        try {
          await direct.query('BEGIN');
          await direct.query("SELECT set_config('app.current_account', $1, true)", [tenantA.accountId]);
          const tenantARows = await direct.query('SELECT id FROM accounts WHERE id = $1', [tenantA.accountId]);
          await direct.query('COMMIT');

          await direct.query('BEGIN');
          const reusedWithoutContext = await direct.query(
            'SELECT id FROM accounts WHERE id = $1',
            [tenantA.accountId],
          );
          await direct.query('COMMIT');

          await direct.query('BEGIN');
          await direct.query("SELECT set_config('app.current_account', $1, true)", [tenantB.accountId]);
          const tenantBRows = await direct.query('SELECT id FROM accounts WHERE id = $1', [tenantB.accountId]);
          await direct.query('COMMIT');

          expect({
            tenantA: tenantARows.rowCount,
            reusedWithoutContext: reusedWithoutContext.rowCount,
            tenantB: tenantBRows.rowCount,
          }).toEqual({ tenantA: 1, reusedWithoutContext: 0, tenantB: 1 });
        } finally {
          await direct.end();
        }
      } finally {
        await store.close();
      }
    } finally {
      await admin.query(`DROP OWNED BY ${roleName}`);
      await admin.query(`DROP ROLE IF EXISTS ${roleName}`);
      await admin.end();
    }
  });
});
