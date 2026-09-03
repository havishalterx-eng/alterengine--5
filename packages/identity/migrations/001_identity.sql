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
