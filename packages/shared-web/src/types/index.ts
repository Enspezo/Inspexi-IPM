/**
 * Types die aantoonbaar identiek zijn in béide web-apps (Beheer-portal +
 * klantportaal). Alleen echt gedeelde vormen horen hier; app-specifieke
 * interfaces blijven in de eigen `@/types` van elke app.
 */

/** Standaard API-foutvorm: `{ success: false, message, statusCode, error? }`. */
export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}
