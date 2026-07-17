// PM-resolutie (PRD-14 §14.3 besluit 7): Project.projectManagerId → plan.reviewerId
// → plan.assignedTo → null. Pure functie zodat de fallback-keten unit-testbaar is.

export interface PlanForPmResolution {
  reviewerId: string | null;
  assignedTo: string | null;
  project?: { projectManagerId: string | null } | null;
}

export function resolveProjectManager(plan: PlanForPmResolution): string | null {
  return plan.project?.projectManagerId ?? plan.reviewerId ?? plan.assignedTo ?? null;
}
