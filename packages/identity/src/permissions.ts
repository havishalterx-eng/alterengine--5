/**
 * Component 42 — the permission model, exactly as contract 42 specifies.
 *
 * Ten toggles, bounded and closed. Not nine, not eleven, and no extension
 * mechanism: adding a toggle is a migration and a contract change, never a
 * string someone invents at a call site. If it is not in PERMISSION_TOGGLES,
 * it does not exist.
 */

export const PERMISSION_TOGGLES = [
  'create_workflow',
  'edit_workflow',
  'view_workflow',
  'approve_human_approval',
  'review_self_heal_replacement',
  'manage_tool_credentials',
  'set_workflow_budget_cap',
  'manage_members_and_roles',
  'view_billing',
  'change_data_retention',
] as const;

export type PermissionToggle = (typeof PERMISSION_TOGGLES)[number];

/**
 * Owner-only actions. NOT toggles, NOT roles, NOT grantable.
 *
 * Billing, transferring ownership, and deleting the account belong to the
 * tenant's owner alone — the creator or an explicit deliberate transfer.
 * Modelling owner as an eleventh toggle or a predefined role would make it
 * grantable through Admin, which the contract forbids.
 */
export const OWNER_ONLY_ACTIONS = [
  'manage_billing',
  'transfer_ownership',
  'delete_account',
] as const;

export type OwnerOnlyAction = (typeof OWNER_ONLY_ACTIONS)[number];

export type MemberAction = PermissionToggle | OwnerOnlyAction;

/** Human-readable labels, for the terminal surface a person actually reads. */
export const TOGGLE_LABELS: Readonly<Record<PermissionToggle, string>> = {
  create_workflow: 'create workflow',
  edit_workflow: 'edit workflow',
  view_workflow: 'view workflow',
  approve_human_approval: 'approve at a HumanApproval node',
  review_self_heal_replacement: 'review a self-heal replacement',
  manage_tool_credentials: 'manage tool credentials',
  set_workflow_budget_cap: 'set a workflow budget cap',
  manage_members_and_roles: 'invite or remove members and assign roles',
  view_billing: 'view billing',
  change_data_retention: 'change data retention settings',
};

/**
 * A role is {name, set of the ten toggles} — ONE data model. Predefined
 * roles are shipped presets of that shape; a custom role is an owner naming
 * their own combination. Nothing about a predefined role behaves differently
 * from a custom one at resolution time.
 */
export interface Role {
  readonly name: string;
  readonly predefined: boolean;
  readonly toggles: readonly PermissionToggle[];
}

const ALL: readonly PermissionToggle[] = PERMISSION_TOGGLES;

/** The shipped presets. A tenant cannot create a role with these names. */
export const PREDEFINED_ROLES: readonly Role[] = [
  { name: 'Admin', predefined: true, toggles: ALL },
  {
    name: 'Member',
    predefined: true,
    toggles: [
      'create_workflow',
      'edit_workflow',
      'view_workflow',
      'approve_human_approval',
      'review_self_heal_replacement',
      'set_workflow_budget_cap',
    ],
  },
  { name: 'Viewer', predefined: true, toggles: ['view_workflow'] },
];

const PREDEFINED_BY_NAME = new Map(PREDEFINED_ROLES.map((role) => [role.name, role]));

export function predefinedRole(name: string): Role | undefined {
  return PREDEFINED_BY_NAME.get(name);
}

/** Names a tenant may not give a custom role: they would shadow a preset. */
export function isReservedRoleName(name: string): boolean {
  return PREDEFINED_BY_NAME.has(name);
}

export function isPermissionToggle(value: string): value is PermissionToggle {
  return (PERMISSION_TOGGLES as readonly string[]).includes(value);
}

export function isOwnerOnlyAction(value: string): value is OwnerOnlyAction {
  return (OWNER_ONLY_ACTIONS as readonly string[]).includes(value);
}
