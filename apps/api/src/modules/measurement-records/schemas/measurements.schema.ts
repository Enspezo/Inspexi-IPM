// Zod-schema voor MeasurementRecord.measurements (Json @default("[]")).
// Vorm: array van meetwaarde-objecten; de veldset is meet-type-afhankelijk, dus
// we borgen alleen de array-vorm en laten de inhoud ongemoeid.
import { jsonArraySchema } from '@/common';

export const MEASUREMENTS_LABEL = 'metingen';

export const measurementsSchema = jsonArraySchema;
