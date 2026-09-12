/**
 * The authorization matrix is driven live from the backend's `Permission` table
 * (via GET /roles/permissions), not a hand-maintained catalog — every module's
 * permissions show up automatically as soon as they're seeded, with no UI change
 * needed here when a new module ships. This file only holds small display helpers.
 */

/** "partially_paid" -> "Partially Paid" — used as the i18n fallback when no translation exists. */
export function formatPermissionAction(action: string): string {
  return action
    .split(/[_:]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** "cost-centers" -> "Cost Centers" — used as the i18n fallback for a raw module/feature id. */
export function formatPermissionLabel(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
