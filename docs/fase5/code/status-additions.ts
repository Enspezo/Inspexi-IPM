// Toe te voegen aan apps/portal/src/lib/status.ts
//
// ALLEEN de lifecycle/structurele enums (die in Fase 1 enums BLEVEN). De status/type-velden
// die LOOKUPS werden (plan/asset/finding/report-status, signatory/signer, pass-fail,
// resolution, client-request) horen NIET hier — die renderen via <LookupBadge> (use-lookups).
//
// StatusMap = Record<string, { label, classes }>; gebruik met <StatusBadge map={..} value={..}/>.

export const CHECKLIST_STATUS: StatusMap = {
  CONCEPT: { label: 'Concept', classes: 'bg-gray-100 text-gray-700' },
  ACTIEF: { label: 'Actief', classes: 'bg-green-100 text-green-800' },
  VERVALLEN: { label: 'Vervallen', classes: 'bg-red-100 text-red-800' },
};

// Zelfde drie waarden — hergebruik voor inspectie- en meetstaat-templates.
export const TEMPLATE_STATUS: StatusMap = CHECKLIST_STATUS;
export const MEASUREMENT_SHEET_STATUS: StatusMap = CHECKLIST_STATUS;

export const INSPECTION_EXEC_STATUS: StatusMap = {
  not_started: { label: 'Niet gestart', classes: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'Mee bezig', classes: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Voltooid', classes: 'bg-green-100 text-green-800' },
};

export const MEASUREMENT_SHEET_RECORD_STATUS: StatusMap = {
  IN_PROGRESS: { label: 'Mee bezig', classes: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Voltooid', classes: 'bg-blue-100 text-blue-800' },
  VALIDATED: { label: 'Gevalideerd', classes: 'bg-green-100 text-green-800' },
};

export const GENERATED_DOCUMENT_STATUS: StatusMap = {
  DRAFT: { label: 'Concept', classes: 'bg-gray-100 text-gray-700' },
  PENDING_SIGNATURES: { label: 'Wacht op ondertekening', classes: 'bg-orange-100 text-orange-800' },
  SIGNED: { label: 'Ondertekend', classes: 'bg-green-100 text-green-800' },
  FINALIZED: { label: 'Definitief', classes: 'bg-green-100 text-green-800' },
};

export const SIGNATURE_STATUS: StatusMap = {
  PENDING: { label: 'In afwachting', classes: 'bg-gray-100 text-gray-700' },
  REQUESTED: { label: 'Verzonden', classes: 'bg-blue-100 text-blue-800' },
  SIGNED: { label: 'Ondertekend', classes: 'bg-green-100 text-green-800' },
  DECLINED: { label: 'Geweigerd', classes: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Verlopen', classes: 'bg-red-100 text-red-800' },
};
