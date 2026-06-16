/**
 * Beschermde systeem-statuscodes die de inspectie-state-machines sturen.
 *
 * Orgs mogen deze statussen herlabelen via lookups, maar de code-waarden
 * hieronder zijn hard-coded in de business-logica. Gedeeld zodat alle
 * services/tests dezelfde bron gebruiken i.p.v. losse string-literals.
 */

// ─── Inspectieplan-statussen (plan state-machine) ───
export const STATUS_DRAFT = 'draft';
export const STATUS_IN_PROGRESS = 'in_progress';
export const STATUS_PENDING_REVIEW = 'pending_review';
export const STATUS_REVIEWED = 'reviewed';
export const STATUS_APPROVED = 'approved';
export const STATUS_COMPLETED = 'completed';

// ─── Constatering-statussen (finding state-machine) ───
export const STATUS_OPEN = 'open';
export const STATUS_RESOLVED = 'resolved';
