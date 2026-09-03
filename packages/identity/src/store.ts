import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
  PERMISSION_TOGGLES,
  PREDEFINED_ROLES,
  isOwnerOnlyAction,
  isPermissionToggle,
  isReservedRoleName,
  predefinedRole,
  type MemberAction,
  type PermissionToggle,
  type Role,
} from './permissions.js';

/**
 * Component 42 — the store and manager of membership facts.
 *
 * The enforce/manage split is the whole point: component 1 ENFORCES
 * permission per request; this component STORES AND MANAGES the facts
 * underneath. The previous build's critical defect lived in that gap — a
 * gateway that derived roles from real queries and then set permissions to
 * a literal empty array, because nothing anywhere derived a permission from
 * a role. resolvePermissions() is the derivation that was missing.
 *
 * Fail-closed throughout: a permission that cannot be confirmed is never
 * granted. Unknown user, unknown account, non-member, or a role name that
 * resolves to nothing — each yields no permissions, never a guess.
 */

export class UnknownRoleError extends Error {
  public constructor(name: string, accountId: string) {
    super(`No role "${name}" exists in this account (${accountId}). Fail-closed: not assignable.`);
    this.name = 'UnknownRoleError';
  }
}

export class NotAMemberError extends Error {
  public constructor(email: string, accountId: string) {
    super(`${email} is not a member of account ${accountId}`);
    this.name = 'NotAMemberError';
  }
}

export interface ResolvedPermissions {
  readonly isOwner: boolean;
  readonly roleName: string;
  readonly permissions: readonly PermissionToggle[];
}

export interface IdentityStore {
  close(): Promise<void>;
  migrate(): Promise<void>;
  createAccount(input: { readonly name: string; readonly ownerEmail: string }): Promise<AccountRef>;
  findAccountByName(name: string): Promise<AccountRef | null>;
  findUserByEmail(email: string): Promise<UserRef | null>;
  addMember(input: {
    readonly accountId: string;
    readonly email: string;
    readonly role: string;
  }): Promise<UserRef>;
  removeMember(input: { readonly accountId: string; readonly email: string }): Promise<void>;
  setMemberRole(input: { readonly accountId: string; readonly userId: string; readonly role: string }): Promise<void>;
  createCustomRole(input: {
    readonly accountId: string;
    readonly name: string;
    readonly toggles: readonly PermissionToggle[];
  }): Promise<Role>;
  listRoles(accountId: string): Promise<readonly Role[]>;
  transferOwnership(input: { readonly accountId: string; readonly toEmail: string }): Promise<void>;
  resolvePermissions(input: { readonly accountId: string; readonly userId: string }): Promise<ResolvedPermissions | null>;
  can(accountId: string, userId: string, action: MemberAction): Promise<boolean>;
}

export interface AccountRef {
  readonly accountId: string;
  readonly name: string;
}

export interface UserRef {
  readonly userId: string;
  readonly email: string;
}

export function createIdentityStore({ databaseUrl }: { readonly databaseUrl: string }): IdentityStore {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    close: async () => pool.end(),
    migrate: async () => {
      const migration = await readFile(
        new URL('../migrations/001_identity.sql', import.meta.url),
        'utf8',
      );
      await pool.query(migration);
    },

    createAccount: async ({ name, ownerEmail }) => {
      const owner = await ensureUser(pool, ownerEmail);
      // The creator holds owner-only actions via owner_user_id — never via a
      // role. They also get a day-to-day Admin membership so they can act.
      const accountId = crypto.randomUUID();
      await pool.query('INSERT INTO accounts (id, name, owner_user_id) VALUES ($1, $2, $3)', [
        accountId,
        name,
        owner.userId,
      ]);
      await pool.query('INSERT INTO memberships (id, account_id, user_id, role_name) VALUES ($1, $2, $3, $4)', [
        crypto.randomUUID(),
        accountId,
        owner.userId,
        'Admin',
      ]);
      return { accountId, name };
    },

    findAccountByName: async (name) => {
      const result = await pool.query<AccountRow>(
        'SELECT id, name FROM accounts WHERE name = $1',
        [name],
      );
      const row = result.rows[0];
      return row === undefined ? null : { accountId: row.id, name: row.name };
    },

    findUserByEmail: async (email) => {
      const result = await pool.query<UserRow>(
        'SELECT id, email FROM users WHERE email = $1',
        [email],
      );
      const row = result.rows[0];
      return row === undefined ? null : { userId: row.id, email: row.email };
    },

    addMember: async ({ accountId, email, role }) => {
      const resolved = await resolveRoleName(pool, accountId, role);
      if (resolved === undefined) throw new UnknownRoleError(role, accountId);
      const user = await ensureUser(pool, email);
      await pool.query(
        'INSERT INTO memberships (id, account_id, user_id, role_name) VALUES ($1, $2, $3, $4) ' +
          'ON CONFLICT (account_id, user_id) DO UPDATE SET role_name = EXCLUDED.role_name',
        [crypto.randomUUID(), accountId, user.userId, role],
      );
      return user;
    },

    removeMember: async ({ accountId, email }) => {
      const user = await findUser(pool, email);
      if (user === null) throw new NotAMemberError(email, accountId);
      // Immediate: the row is deleted, so the next resolution — on any live
      // connection, from any process — sees no membership and grants
      // nothing. There is no cache to expire.
      await pool.query('DELETE FROM memberships WHERE account_id = $1 AND user_id = $2', [
        accountId,
        user.userId,
      ]);
    },

    setMemberRole: async ({ accountId, userId, role }) => {
      const resolved = await resolveRoleName(pool, accountId, role);
      if (resolved === undefined) throw new UnknownRoleError(role, accountId);
      const updated = await pool.query(
        'UPDATE memberships SET role_name = $1 WHERE account_id = $2 AND user_id = $3 RETURNING id',
        [role, accountId, userId],
      );
      if (updated.rowCount === 0) throw new NotAMemberError(userId, accountId);
    },

    createCustomRole: async ({ accountId, name, toggles }) => {
      if (isReservedRoleName(name)) {
        throw new UnknownRoleError(name, accountId);
      }
      for (const toggle of toggles) {
        if (!isPermissionToggle(toggle)) {
          throw new Error(`Not one of the ten permission toggles: "${toggle}"`);
        }
      }
      const flags = new Set(toggles);
      await pool.query(
        `INSERT INTO custom_roles (
           id, account_id, name, ${PERMISSION_TOGGLES.join(', ')}
         ) VALUES ($1, $2, $3, ${PERMISSION_TOGGLES.map((_, index) => `$${index + 4}`).join(', ')})`,
        [crypto.randomUUID(), accountId, name, ...PERMISSION_TOGGLES.map((t) => flags.has(t))],
      );
      return { name, predefined: false, toggles };
    },

    listRoles: async (accountId) => {
      const customs = await pool.query<CustomRoleRow>(
        'SELECT * FROM custom_roles WHERE account_id = $1 ORDER BY name',
        [accountId],
      );
      // The shipped presets plus THIS tenant's customs — another tenant's
      // custom role never appears here, because the lookup is scoped.
      return [
        ...PREDEFINED_ROLES,
        ...customs.rows.map((row) => roleFromRow(row)),
      ];
    },

    transferOwnership: async ({ accountId, toEmail }) => {
      // Explicit and deliberate: the only path that moves owner-only
      // actions, and it names the successor by their email.
      //
      // The successor may be a genuine non-member — the realistic transfer,
      // to someone outside the existing team. createAccount gives its
      // founder owner_user_id AND an Admin membership; the transfer must
      // land the successor with functioning access the same way, or they
      // own an account they cannot use: resolvePermissions() would return
      // null (indistinguishable from "not a member") while can() granted
      // owner-only actions one at a time through the owner fallback.
      //
      // One transaction: owner_user_id and the membership row change
      // together or not at all — no window where ownership has moved but
      // membership has not caught up. The previous owner's own Admin
      // membership is untouched.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        let successorId = await userIdByEmail(client, toEmail);
        if (successorId === null) {
          successorId = crypto.randomUUID();
          await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
            successorId,
            toEmail,
          ]);
        }

        const updated = await client.query(
          'UPDATE accounts SET owner_user_id = $1 WHERE id = $2 RETURNING id',
          [successorId, accountId],
        );
        if (updated.rowCount === 0) {
          await client.query('ROLLBACK');
          throw new NotAMemberError(toEmail, accountId);
        }

        await client.query(
          'INSERT INTO memberships (id, account_id, user_id, role_name) VALUES ($1, $2, $3, $4) ' +
            'ON CONFLICT (account_id, user_id) DO UPDATE SET role_name = EXCLUDED.role_name',
          [crypto.randomUUID(), accountId, successorId, 'Admin'],
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    resolvePermissions: async ({ accountId, userId }) => {
      const result = await pool.query<MembershipRow>(
        `SELECT m.role_name, a.owner_user_id
         FROM memberships m JOIN accounts a ON a.id = m.account_id
         WHERE m.account_id = $1 AND m.user_id = $2`,
        [accountId, userId],
      );
      const row = result.rows[0];
      if (row === undefined) return null;

      // Not a member: no permissions, no owner claim. A member whose role
      // name resolves to nothing (custom role deleted, or a foreign role
      // name forced onto the row) gets an empty set — never a guess.
      const role = await resolveRoleName(pool, accountId, row.role_name);
      const permissions = role?.toggles ?? [];
      return { isOwner: row.owner_user_id === userId, roleName: row.role_name, permissions };
    },

    can: async (accountId, userId, action) => {
      const resolved = await pool.query<MembershipRow>(
        `SELECT m.role_name, a.owner_user_id
         FROM memberships m JOIN accounts a ON a.id = m.account_id
         WHERE m.account_id = $1 AND m.user_id = $2`,
        [accountId, userId],
      );
      const row = resolved.rows[0];
      if (row === undefined) {
        // An owner-only action may still apply: owner is not a membership.
        if (isOwnerOnlyAction(action)) {
          const account = await pool.query<OwnerRow>(
            'SELECT owner_user_id FROM accounts WHERE id = $1',
            [accountId],
          );
          return account.rows[0]?.owner_user_id === userId;
        }
        return false;
      }

      if (isOwnerOnlyAction(action)) {
        // Owner-only actions are not toggles: no role grants them, ever.
        return row.owner_user_id === userId;
      }

      const role = await resolveRoleName(pool, accountId, row.role_name);
      if (role === undefined) return false;
      return role.toggles.includes(action);
    },
  };
}

async function ensureUser(pool: Pool, email: string): Promise<UserRef> {
  const existing = await findUser(pool, email);
  if (existing !== null) return existing;
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [id, email]);
  return (await findUser(pool, email)) ?? { userId: id, email };
}

async function findUser(pool: Pool, email: string): Promise<UserRef | null> {
  const result = await pool.query<UserRow>('SELECT id, email FROM users WHERE email = $1', [email]);
  const row = result.rows[0];
  return row === undefined ? null : { userId: row.id, email: row.email };
}

async function userIdByEmail(client: PoolClient, email: string): Promise<string | null> {
  const result = await client.query<UserRow>('SELECT id, email FROM users WHERE email = $1', [email]);
  return result.rows[0]?.id ?? null;
}

/**
 * The single role-resolution path: this tenant's custom role by that name,
 * else the shipped preset. Scoped by account_id, so one tenant's custom
 * role is invisible to another by construction — there is no unscoped
 * lookup anywhere.
 */
async function resolveRoleName(pool: Pool, accountId: string, name: string): Promise<Role | undefined> {
  const custom = await pool.query<CustomRoleRow>(
    'SELECT * FROM custom_roles WHERE account_id = $1 AND name = $2',
    [accountId, name],
  );
  const row = custom.rows[0];
  if (row !== undefined) return { name, predefined: false, toggles: roleFromRow(row).toggles };
  return predefinedRole(name);
}

function roleFromRow(row: CustomRoleRow): Role {
  return {
    name: row.name,
    predefined: false,
    toggles: PERMISSION_TOGGLES.filter((toggle) => row[toggle] === true),
  };
}

interface AccountRow extends QueryResultRow {
  readonly id: string;
  readonly name: string;
}

interface UserRow extends QueryResultRow {
  readonly id: string;
  readonly email: string;
}

interface MembershipRow extends QueryResultRow {
  readonly role_name: string;
  readonly owner_user_id: string;
}

interface OwnerRow extends QueryResultRow {
  readonly owner_user_id: string;
}

interface CustomRoleRow extends QueryResultRow {
  readonly name: string;
  readonly [toggle: string]: boolean | string | Date;
}
