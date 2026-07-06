// Zod-schema voor AssetNode.technicalData (Json @default("{}")).
// Vormvrij: custom velden per asset-/locatietype-definitie → permissief object,
// onbekende keys toegestaan. We borgen alleen dat het een object is (geen array/string).
import { jsonObjectSchema } from '@/common';

export const TECHNICAL_DATA_LABEL = 'technische gegevens';

export const technicalDataSchema = jsonObjectSchema;
