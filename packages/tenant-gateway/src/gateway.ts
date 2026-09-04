import { unimplemented } from '@alter/contracts';
import type { IdentityStore, PermissionToggle } from '@alter/identity';
import {
  createJwtValidator,
  JwtRejectedError,
  type JwtValidatorOptions,
} from '@alter/safety';
import { Pool, type PoolClient } from 'pg';

const actorContextBrand: unique symbol = Symbol('ActorContext');

export interface ActorContext {
  readonly tenant_id: string;
  readonly actor_id: string;
  readonly roles: readonly string[];
  readonly resolved_permissions: readonly PermissionToggle[];
  /** Component 46 introduces narrower workspace ownership; tenant is the only safe scope today. */
  readonly workspace_scope: 'tenant';
  readonly [actorContextBrand]: true;
}

export interface TriggerOriginatedRequest {
  readonly workflowReference: string;
}

export interface TenantGateway {
  resolveHumanRequest(input: {
    readonly bearerToken: string | undefined;
    readonly tenantId: string;
  }): Promise<ActorContext>;
  resolveTriggerOriginated(input: TriggerOriginatedRequest): never;
  withActor<T>(actor: ActorContext, operation: (client: PoolClient) => Promise<T>): Promise<T>;
  jwksFetchCount(): number;
  close(): Promise<void>;
}

export class TenantAccessDeniedError extends Error {
  override readonly name = 'TenantAccessDeniedError';
}

export function createTenantGateway(input: {
  readonly databaseUrl: string;
  readonly identity: IdentityStore;
  readonly jwt: JwtValidatorOptions;
}): TenantGateway {
  const validator = createJwtValidator(input.jwt);
  const pool = new Pool({ connectionString: input.databaseUrl });

  return {
    async resolveHumanRequest({ bearerToken, tenantId }) {
      if (bearerToken === undefined || bearerToken === '') deny('Bearer token is required');

      try {
        const claims = await validator.verify(bearerToken);
        const email = claims.email;
        if (typeof email !== 'string' || email === '') deny('Token has no usable email claim');

        const user = await input.identity.findUserByEmail(email);
        if (user === null) deny('Token subject is not a known member');

        const resolved = await input.identity.resolvePermissions({
          accountId: tenantId,
          userId: user.userId,
        });
        if (resolved === null || resolved.permissions.length === 0) {
          deny('No permissions are established for this tenant');
        }

        return {
          tenant_id: tenantId,
          actor_id: user.userId,
          roles: [resolved.roleName],
          resolved_permissions: resolved.permissions,
          workspace_scope: 'tenant',
          [actorContextBrand]: true,
        };
      } catch (error) {
        if (error instanceof TenantAccessDeniedError) throw error;
        if (error instanceof JwtRejectedError) deny(`JWT rejected: ${error.message}`);
        deny('Identity or permissions could not be established');
      }
    },

    resolveTriggerOriginated(_input) {
      // Mandatory revisit at step 32: component 2 supplies the workflow
      // reference and component 46 supplies ownership facts. A fabricated
      // resolution here would be an unscoped actor masquerading as system.
      return unimplemented({
        component: 1,
        capability: 'identity.resolveTriggerOriginated',
        trackingReference: 'ALTER-1-revisit-step-32',
      });
    },

    async withActor(actor, operation) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_account', $1, true)", [actor.tenant_id]);
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    jwksFetchCount: () => validator.jwksFetchCount(),
    close: async () => pool.end(),
  };
}

function deny(message: string): never {
  throw new TenantAccessDeniedError(message);
}
