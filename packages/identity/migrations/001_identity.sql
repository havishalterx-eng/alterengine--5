-- Component 42 — Identity & Membership.
--
-- Four tables, all registered with Deletion & Retention in
-- packages/deletion-registry/src/declaration.ts. The deletion-schema gate
-- joins that declaration against this live schema in both directions.

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Owner is accounts.owner_user_id, deliberately NOT a membership row and
-- NOT a role: owner-only actions cannot be granted through any role.
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts (id),
  user_id UUID NOT NULL REFERENCES users (id),
  role_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

-- ONE data model for roles: a custom role is the same {name, toggles} shape
-- as a shipped preset, stored per tenant. Private to its tenant by the
-- account_id on every row and on every lookup.
CREATE TABLE IF NOT EXISTS custom_roles (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts (id),
  name TEXT NOT NULL,
  create_workflow BOOLEAN NOT NULL,
  edit_workflow BOOLEAN NOT NULL,
  view_workflow BOOLEAN NOT NULL,
  approve_human_approval BOOLEAN NOT NULL,
  review_self_heal_replacement BOOLEAN NOT NULL,
  manage_tool_credentials BOOLEAN NOT NULL,
  set_workflow_budget_cap BOOLEAN NOT NULL,
  manage_members_and_roles BOOLEAN NOT NULL,
  view_billing BOOLEAN NOT NULL,
  change_data_retention BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, name)
);

-- Row-level security with FORCE, per the CEO decision on PR #7.
--
-- WRITTEN GAP, do not read this as closed: enforcement is UNPROVEN today
-- and cannot be proven until component 1 (step 2) supplies real
-- per-request tenant context — and the local development Postgres connects
-- as a superuser, which bypasses RLS regardless of what policies exist.
-- A test asserting these policies block anything would pass vacuously
-- right now. The policies are here so the shape is right from the first
-- migration; step 2 must prove them against a non-superuser connection.
--
-- Fail-closed by construction: with app.current_account unset (the
-- situation until component 1 exists), current_setting(..., true) is NULL,
-- every comparison is NULL, and NO rows are visible. Nobody sees tenant
-- data by forgetting to set the context.
--
-- users is deliberately NOT covered: it is cross-tenant by design (one
-- person, memberships in many tenants), reported in the step-1 notes and
-- confirmed by the CEO's list.

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON accounts;
CREATE POLICY tenant_isolation ON accounts
  USING (id = NULLIF(current_setting('app.current_account', true), '')::uuid);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON memberships;
CREATE POLICY tenant_isolation ON memberships
  USING (account_id = NULLIF(current_setting('app.current_account', true), '')::uuid);

ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON custom_roles;
CREATE POLICY tenant_isolation ON custom_roles
  USING (account_id = NULLIF(current_setting('app.current_account', true), '')::uuid);
