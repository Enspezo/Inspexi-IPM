// Voorbeeld-context voor template-previews. Levert een representatieve DocumentData
// zodat SECTIONS-templates (Handlebars-placeholders) en BLOCKS-previews echte HTML
// opleveren zonder een bestaand InspectionPlan. Bij het echt genereren van een
// document (generated-documents, Fase 4 vervolg) wordt deze context uit het plan opgebouwd.

import { DocumentType } from '@prisma/client';
import type { DocumentData } from './types';

/**
 * Bouw een dummy DocumentData voor previews.
 * @param documentType PLAN of REPORT — beïnvloedt alleen de voorbeeld-referentie/projectnaam.
 */
export function buildSampleContext(documentType: DocumentType = DocumentType.REPORT): DocumentData {
  const now = new Date();
  const isPlan = documentType === DocumentType.PLAN;

  return {
    organization: {
      name: 'InspeXi Demo B.V.',
      address: 'Voorbeeldstraat 1',
      postalCode: '1234 AB',
      city: 'Amsterdam',
      phone: '020-1234567',
      email: 'info@inspexi-demo.nl',
      kvk: '12345678',
      certifications: ['SCIOS Scope 8', 'SCIOS Scope 10'],
    },
    client: {
      name: 'Voorbeeld Klant N.V.',
      contactPerson: 'Jan Jansen',
      address: 'Klantlaan 42',
      postalCode: '5678 CD',
      city: 'Rotterdam',
      phone: '010-7654321',
      email: 'jan.jansen@voorbeeldklant.nl',
    },
    location: {
      name: isPlan ? 'Inspectielocatie (gepland)' : 'Inspectielocatie',
      address: 'Industrieweg 100',
      postalCode: '9012 EF',
      city: 'Utrecht',
    },
    plan: {
      id: '00000000-0000-0000-0000-000000000000',
      reference: isPlan ? 'PLAN-2026-0001' : 'RAP-2026-0001',
      projectName: 'Periodieke inspectie elektrische installatie',
      date: now,
      plannedDate: now,
      scope: 'Volledige installatie conform NEN 3140',
      description: 'Voorbeeldomschrijving voor de template-preview.',
      normType: 'NEN3140',
      normTypeName: 'NEN 3140 — Bedrijfsvoering elektrische installaties',
      status: isPlan ? 'GEPLAND' : 'AFGEROND',
    },
    inspector: {
      name: 'Piet de Inspecteur',
      email: 'inspecteur@inspexi-demo.nl',
      certifications: ['Vakbekwaam Persoon (VP)'],
    },
    reviewer: {
      name: 'Karel de Controleur',
      email: 'controleur@inspexi-demo.nl',
    },
    assets: [
      {
        id: 'asset-1',
        name: 'Hoofdverdeler HV-01',
        type: 'hoofdverdeler',
        typeName: 'Hoofdverdeler',
        identifier: 'HV-01',
        locationDescription: 'Technische ruimte begane grond',
        status: 'GEINSPECTEERD',
        photos: [
          {
            id: 'photo-1',
            url: 'https://via.placeholder.com/400x300?text=HV-01',
            caption: 'Hoofdverdeler HV-01',
            capturedAt: now,
          },
        ],
        findings: [
          {
            id: 'finding-1',
            reference: 'NEN3140-5.3',
            shortDescription: 'Ontbrekende afdekking aansluitklemmen',
            longDescription: 'De aansluitklemmen van groep 3 zijn niet voorzien van een afdekking.',
            classification: '2',
            classificationColor: '#ea580c',
            classificationName: 'Serieus',
            assetId: 'asset-1',
            assetName: 'Hoofdverdeler HV-01',
            locationDescription: 'Technische ruimte begane grond',
            photos: [],
            recommendation: 'Afdekking aanbrengen binnen 1 maand.',
            status: 'OPEN',
            normReference: 'NEN3140-5.3',
          },
        ],
        measurements: {},
      },
      {
        id: 'asset-2',
        name: 'Onderverdeler OV-12',
        type: 'onderverdeler',
        typeName: 'Onderverdeler',
        identifier: 'OV-12',
        locationDescription: 'Productiehal noord',
        status: 'GEINSPECTEERD',
        photos: [],
        findings: [],
        measurements: {},
      },
    ],
    findings: [
      {
        id: 'finding-1',
        reference: 'NEN3140-5.3',
        shortDescription: 'Ontbrekende afdekking aansluitklemmen',
        longDescription: 'De aansluitklemmen van groep 3 zijn niet voorzien van een afdekking.',
        classification: '2',
        classificationColor: '#ea580c',
        classificationName: 'Serieus',
        assetId: 'asset-1',
        assetName: 'Hoofdverdeler HV-01',
        locationDescription: 'Technische ruimte begane grond',
        photos: [],
        recommendation: 'Afdekking aanbrengen binnen 1 maand.',
        status: 'OPEN',
        normReference: 'NEN3140-5.3',
      },
    ],
    findingsSummary: {
      total: 1,
      byClassification: { '2': 1 },
      byStatus: { OPEN: 1 },
    },
    measurementSheets: [
      {
        id: 'ms-1',
        name: 'Meetstaat hoofdverdeler',
        templateCode: 'MS-HV',
        assetId: 'asset-1',
        assetName: 'Hoofdverdeler HV-01',
        date: now,
        inspector: 'Piet de Inspecteur',
        sections: [
          {
            name: 'Isolatieweerstand',
            fields: { L1: '> 1 MΩ', L2: '> 1 MΩ', L3: '> 1 MΩ' },
          },
        ],
      },
    ],
    currentDate: now,
    generatedAt: now,
  };
}
