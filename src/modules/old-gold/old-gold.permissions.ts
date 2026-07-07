/**
 * All permission keys for the Old Gold module.
 *
 * These strings live in CustomRole.sidebar_permissions[].
 * The PermissionsGuard reads them from the JWT payload (custom-role users)
 * or falls back to DEFAULT_ROLE_PERMISSIONS (built-in manager/cashier roles).
 *
 * To grant a capability to a custom role, the admin simply checks the
 * corresponding key on the Roles configuration page — no code changes needed.
 */
export const OG = {
  // ── Visibility ──────────────────────────────────────────────────────────────
  /** Sidebar page access — user can see the Old Gold section */
  PAGE: 'old-gold',

  /** View transactions for own branch only */
  VIEW_BRANCH: 'old-gold.view-branch',

  /** View transactions across all branches */
  VIEW_ALL: 'old-gold.view-all',

  // ── Transaction lifecycle ────────────────────────────────────────────────────
  /** Create a new draft transaction */
  CREATE: 'old-gold.create',

  /** Edit a transaction while it is still in draft */
  EDIT: 'old-gold.edit',

  /** Submit a draft for approval */
  SUBMIT: 'old-gold.submit',

  /** Approve a submitted transaction */
  APPROVE: 'old-gold.approve',

  /** Reject a submitted transaction */
  REJECT: 'old-gold.reject',

  // ── Post-approval ────────────────────────────────────────────────────────────
  /** Authorise the physical melting of approved gold items */
  AUTHORIZE_MELT: 'old-gold.melt',

  /** Settle a transaction (record payment to customer) */
  SETTLE: 'old-gold.settle',

  // ── Privileged overrides ─────────────────────────────────────────────────────
  /** Override the system-computed valuation on any line item */
  OVERRIDE_VALUATION: 'old-gold.override-valuation',

  /** Reverse a completed settlement */
  REVERSE_SETTLEMENT: 'old-gold.reverse-settlement',

  /** Access and modify Old Gold module settings */
  MANAGE_SETTINGS: 'old-gold.settings',

  /** Generate the printable buy-back form and upload/view the signed copy */
  MANAGE_FORM: 'old-gold.manage-form',
} as const;

export type OGPermission = (typeof OG)[keyof typeof OG];

/**
 * Ordered list used by the admin Roles page to render the Old Gold group.
 * Keeping it here ensures the UI and the guard always share the same keys.
 */
export const OG_PERMISSION_ITEMS: { key: OGPermission; label: string }[] = [
  { key: OG.PAGE,               label: 'Old Gold — Page Access' },
  { key: OG.VIEW_BRANCH,        label: 'View Branch Transactions' },
  { key: OG.VIEW_ALL,           label: 'View All Transactions' },
  { key: OG.CREATE,             label: 'Create Transaction' },
  { key: OG.EDIT,               label: 'Edit Transaction' },
  { key: OG.SUBMIT,             label: 'Submit Transaction' },
  { key: OG.APPROVE,            label: 'Approve Transaction' },
  { key: OG.REJECT,             label: 'Reject Transaction' },
  { key: OG.AUTHORIZE_MELT,     label: 'Authorize Melting' },
  { key: OG.SETTLE,             label: 'Settle Transaction' },
  { key: OG.OVERRIDE_VALUATION, label: 'Override Valuation Rules' },
  { key: OG.REVERSE_SETTLEMENT, label: 'Reverse Settlements' },
  { key: OG.MANAGE_SETTINGS,    label: 'Manage Old Gold Settings' },
  { key: OG.MANAGE_FORM,        label: 'Generate & Upload Buy-Back Form' },
];
