/**
 * All permission keys for the Gold Loan module.
 *
 * These strings live in CustomRole.sidebar_permissions[].
 * The PermissionsGuard reads them from the JWT payload (custom-role users)
 * or falls back to DEFAULT_ROLE_PERMISSIONS (built-in manager role).
 *
 * To grant a capability to a custom role, the admin simply checks the
 * corresponding key on the Roles configuration page — no code changes needed.
 */
export const GL = {
  // ── Visibility ──────────────────────────────────────────────────────────────
  /** Sidebar page access — user can see the Gold Loan section */
  PAGE: 'gold-loan',

  /** View loans for own branch only */
  VIEW_BRANCH: 'gold-loan.view-branch',

  /** View loans across all branches */
  VIEW_ALL: 'gold-loan.view-all',

  // ── Loan lifecycle ───────────────────────────────────────────────────────────
  /** Create a new draft loan request */
  CREATE: 'gold-loan.create',

  /** Edit a loan request while it is still in draft */
  EDIT: 'gold-loan.edit',

  /** Submit a draft request for admin approval */
  SUBMIT: 'gold-loan.submit',

  /** Approve a submitted loan request (disburses it) */
  APPROVE: 'gold-loan.approve',

  /** Reject a submitted loan request */
  REJECT: 'gold-loan.reject',

  // ── Servicing ────────────────────────────────────────────────────────────────
  /** Mark a month's EMI as paid or missed */
  MARK_EMI: 'gold-loan.mark-emi',

  /** Close a loan (principal redeemed / written off) */
  CLOSE: 'gold-loan.close',

  /** Generate the printable pledge agreement and upload/view the signed copy */
  MANAGE_FORM: 'gold-loan.manage-form',

  /** Export the loan catalog (Excel) */
  EXPORT: 'gold-loan.export',
} as const;

export type GLPermission = (typeof GL)[keyof typeof GL];

/**
 * Ordered list used by the admin Roles page to render the Gold Loan group.
 * Keeping it here ensures the UI and the guard always share the same keys.
 */
export const GL_PERMISSION_ITEMS: { key: GLPermission; label: string }[] = [
  { key: GL.PAGE,        label: 'Gold Loan — Page Access' },
  { key: GL.VIEW_BRANCH, label: 'View Branch Loans' },
  { key: GL.VIEW_ALL,    label: 'View All Loans' },
  { key: GL.CREATE,      label: 'Create Loan Request' },
  { key: GL.EDIT,        label: 'Edit Loan Request' },
  { key: GL.SUBMIT,      label: 'Submit Loan Request' },
  { key: GL.APPROVE,     label: 'Approve Loan Request' },
  { key: GL.REJECT,      label: 'Reject Loan Request' },
  { key: GL.MARK_EMI,    label: 'Mark EMI Paid / Missed' },
  { key: GL.CLOSE,       label: 'Close Loan' },
  { key: GL.MANAGE_FORM, label: 'Generate & Upload Pledge Form' },
  { key: GL.EXPORT,      label: 'Export Loan Catalog' },
];
