// Geport uit Inspexi-App. Beheer-conventies + Fase 1-schema:
//  - status (enum MeasurementSheetRecordStatus) — GEEN lookup; alleen IN_PROGRESS
//    records zijn bewerkbaar/verwijderbaar (App-status-guard)
//  - gedenormaliseerde orgId (overgenomen van de parent-asset)
//  - FK-validatie: asset + inspectionPlan binnen dezelfde org (assertSameOrg);
//    template is GLOBAAL (geen orgId) → alleen assertFound
//  - snapshot van het template (+secties+velden) bij aanmaken; templateVersion
//    vastgelegd; harde delete (model heeft GEEN deletedAt)
//
// validate() draait validatie tegen de snapshot; complete() draait de
// finalCheckRules uit de snapshot en zet de status naar COMPLETED (mits geldig).

import { Injectable, BadRequestException } from '@nestjs/common';
import {
  User,
  Prisma,
  MeasurementSheetRecordStatus,
  MeasurementSheetTemplateStatus,
  PassFailOperator,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, assertSameOrg } from '@/common';
import {
  CreateMeasurementSheetRecordDto,
  UpdateMeasurementSheetRecordDto,
  QueryMeasurementSheetRecordsDto,
} from './dto';

interface FieldValue {
  value: unknown;
  passFail?: 'pass' | 'fail' | null;
}

export interface ValidationError {
  sectionCode: string;
  rowIndex: string;
  fieldCode: string;
  message: string;
  type: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface FinalCheckResult {
  passed: boolean;
  results: Array<{
    ruleType: string;
    passed: boolean;
    message?: string;
    details?: Record<string, unknown>;
  }>;
}

@Injectable()
export class MeasurementSheetRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireOrg(user: User): string {
    if (!user.orgId) throw new BadRequestException('Selecteer eerst een organisatie');
    return user.orgId;
  }

  /** Org-scoped record of NotFound (NL). */
  private async getRecordInOrg(id: string, user: User) {
    return assertFound(
      await this.prisma.measurementSheetRecord.findFirst({
        where: { id, ...orgScope(user) },
        include: {
          template: { select: { id: true, code: true, name: true, version: true } },
          asset: {
            select: { id: true, name: true, assetType: true, inspectionPlanId: true },
          },
        },
      }),
      'Meetstaat',
    );
  }

  /** Lijst met filters (plat — geen paginatie, conform App). */
  async findAll(user: User, query: QueryMeasurementSheetRecordsDto) {
    const { assetId, inspectionPlanId, templateId, status } = query;

    const where: Prisma.MeasurementSheetRecordWhereInput = {
      ...orgScope(user),
      ...(assetId ? { assetId } : {}),
      ...(inspectionPlanId ? { inspectionPlanId } : {}),
      ...(templateId ? { templateId } : {}),
      ...(status ? { status } : {}),
    };

    return this.prisma.measurementSheetRecord.findMany({
      where,
      include: {
        template: { select: { id: true, code: true, name: true, version: true } },
        asset: { select: { id: true, name: true, assetType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, user: User) {
    return this.getRecordInOrg(id, user);
  }

  /** Snapshot-create: template (+secties+velden) wordt bevroren in de record. */
  async create(user: User, dto: CreateMeasurementSheetRecordDto, deviceId?: string) {
    const orgId = this.requireOrg(user);

    // FK-validatie binnen dezelfde org (asset + optioneel plan)
    await assertSameOrg(this.prisma.asset, dto.assetId, orgId, 'Asset');
    if (dto.inspectionPlanId) {
      await assertSameOrg(
        this.prisma.inspectionPlan,
        dto.inspectionPlanId,
        orgId,
        'Inspectieplan',
      );
    }

    // Asset moet daadwerkelijk bestaan/scoped zijn — orgId voor de record halen we hier vandaan
    const asset = assertFound(
      await this.prisma.asset.findFirst({ where: { id: dto.assetId, ...orgScope(user), deletedAt: null } }),
      'Asset',
    );

    // Asset moet bij het opgegeven plan horen
    if (dto.inspectionPlanId && asset.inspectionPlanId !== dto.inspectionPlanId) {
      throw new BadRequestException('Asset hoort niet bij het opgegeven inspectieplan');
    }

    // GLOBAAL template laden (geen orgId → alleen assertFound)
    const template = assertFound(
      await this.prisma.measurementSheetTemplate.findUnique({
        where: { id: dto.templateId },
        include: {
          sections: {
            include: { fields: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      'Meetstaat-template',
    );

    if (template.status !== MeasurementSheetTemplateStatus.ACTIEF) {
      throw new BadRequestException('Alleen ACTIEVE templates kunnen gebruikt worden');
    }

    // Snapshot + lege datastructuur
    const templateSnapshot = this.createTemplateSnapshot(template);
    const initialData: Record<string, Record<string, Record<string, FieldValue>>> = {};
    for (const section of template.sections) {
      initialData[section.code] = { '0': {} };
      for (const field of section.fields) {
        initialData[section.code]['0'][field.code] = { value: null, passFail: null };
      }
    }

    return this.prisma.measurementSheetRecord.create({
      data: {
        orgId: asset.orgId,
        templateId: template.id,
        assetId: dto.assetId,
        inspectionPlanId: dto.inspectionPlanId ?? null,
        templateVersion: template.version,
        templateSnapshot: templateSnapshot as unknown as Prisma.InputJsonValue,
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
        data: initialData as unknown as Prisma.InputJsonValue,
        deviceId,
        createdBy: user.id,
      },
      include: {
        template: { select: { id: true, code: true, name: true, version: true } },
        asset: { select: { id: true, name: true, assetType: true } },
      },
    });
  }

  /** Data bijwerken — alleen IN_PROGRESS. */
  async update(id: string, user: User, dto: UpdateMeasurementSheetRecordDto, deviceId?: string) {
    this.requireOrg(user);
    const record = await this.getRecordInOrg(id, user);

    if (record.status !== MeasurementSheetRecordStatus.IN_PROGRESS) {
      throw new BadRequestException('Alleen meetstaten met status IN_PROGRESS kunnen bijgewerkt worden');
    }

    const snapshot = record.templateSnapshot as unknown as ReturnType<
      typeof this.createTemplateSnapshot
    >;
    const updatedData = this.evaluatePassFail(dto.data, snapshot);

    return this.prisma.measurementSheetRecord.update({
      where: { id: record.id },
      data: {
        data: updatedData as unknown as Prisma.InputJsonValue,
        deviceId,
        syncedAt: new Date(),
      },
      include: {
        template: { select: { id: true, code: true, name: true, version: true } },
        asset: { select: { id: true, name: true, assetType: true } },
      },
    });
  }

  /** Validatie tegen de snapshot (zonder status te wijzigen). */
  async validate(id: string, user: User): Promise<ValidationResult> {
    this.requireOrg(user);
    const record = await this.getRecordInOrg(id, user);
    return this.runValidation(record);
  }

  /** Harde delete — alleen IN_PROGRESS. */
  async delete(id: string, user: User) {
    this.requireOrg(user);
    const record = await this.getRecordInOrg(id, user);

    if (record.status !== MeasurementSheetRecordStatus.IN_PROGRESS) {
      throw new BadRequestException('Alleen meetstaten met status IN_PROGRESS kunnen verwijderd worden');
    }

    await this.prisma.measurementSheetRecord.delete({ where: { id: record.id } });
    return { deleted: true };
  }

  /** Afronden: final-check draaien en status naar COMPLETED (mits geldig). */
  async complete(id: string, user: User) {
    this.requireOrg(user);
    const record = await this.getRecordInOrg(id, user);

    if (record.status !== MeasurementSheetRecordStatus.IN_PROGRESS) {
      throw new BadRequestException('Alleen meetstaten met status IN_PROGRESS kunnen afgerond worden');
    }

    const validationResult = this.runValidation(record);
    const finalCheckResult = this.runFinalCheck(record);
    const canComplete = validationResult.valid && finalCheckResult.passed;

    return this.prisma.measurementSheetRecord.update({
      where: { id: record.id },
      data: {
        status: canComplete
          ? MeasurementSheetRecordStatus.COMPLETED
          : MeasurementSheetRecordStatus.IN_PROGRESS,
        finalCheckExecuted: true,
        finalCheckPassed: finalCheckResult.passed,
        finalCheckResults: finalCheckResult as unknown as Prisma.InputJsonValue,
        completedAt: canComplete ? new Date() : null,
      },
      include: {
        template: { select: { id: true, code: true, name: true, version: true } },
        asset: { select: { id: true, name: true, assetType: true } },
      },
    });
  }

  // ── helpers ──

  /** Snapshot van het template voor versie-tracking. */
  private createTemplateSnapshot(
    template: NonNullable<Awaited<ReturnType<typeof this.getTemplateWithDetails>>>,
  ) {
    return {
      id: template.id,
      code: template.code,
      name: template.name,
      version: template.version,
      normTypeCode: template.normTypeCode,
      assetTypes: template.assetTypes,
      locationTypes: template.locationTypes,
      finalCheckRules: template.finalCheckRules,
      sections: template.sections.map((section) => ({
        code: section.code,
        name: section.name,
        description: section.description,
        isRepeating: section.isRepeating,
        minRows: section.minRows,
        sortOrder: section.sortOrder,
        collapsible: section.collapsible,
        defaultCollapsed: section.defaultCollapsed,
        rowValidationRules: section.rowValidationRules,
        fields: section.fields.map((field) => ({
          code: field.code,
          name: field.name,
          description: field.description,
          fieldType: field.fieldType,
          sortOrder: field.sortOrder,
          placeholder: field.placeholder,
          width: field.width,
          unit: field.unit,
          decimals: field.decimals,
          minValue: field.minValue?.toString() ?? null,
          maxValue: field.maxValue?.toString() ?? null,
          dropdownOptions: field.dropdownOptions,
          formula: field.formula,
          formulaDependencies: field.formulaDependencies,
          isRequired: field.isRequired,
          passFailEnabled: field.passFailEnabled,
          passFailOperator: field.passFailOperator,
          passFailValue: field.passFailValue?.toString() ?? null,
          passFailMinValue: field.passFailMinValue?.toString() ?? null,
          passFailMaxValue: field.passFailMaxValue?.toString() ?? null,
          passFailValues: field.passFailValues,
          passFailFailMessage: field.passFailFailMessage,
          autoFindingEnabled: field.autoFindingEnabled,
          autoFindingTemplateId: field.autoFindingTemplateId,
          copyValueOnNewRow: field.copyValueOnNewRow,
          allowBulkEdit: field.allowBulkEdit,
        })),
      })),
    };
  }

  private async getTemplateWithDetails(templateId: string) {
    return this.prisma.measurementSheetTemplate.findUnique({
      where: { id: templateId },
      include: {
        sections: {
          include: { fields: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  /** Validatie-kern (gedeeld door validate + complete). */
  private runValidation(
    record: Awaited<ReturnType<typeof this.getRecordInOrg>>,
  ): ValidationResult {
    const snapshot = record.templateSnapshot as unknown as ReturnType<
      typeof this.createTemplateSnapshot
    >;
    const data = record.data as unknown as Record<
      string,
      Record<string, Record<string, FieldValue>>
    >;

    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    for (const section of snapshot.sections) {
      const sectionData = data[section.code] || {};

      if (section.isRepeating) {
        const rowCount = Object.keys(sectionData).length;
        if (rowCount < section.minRows) {
          errors.push({
            sectionCode: section.code,
            rowIndex: '0',
            fieldCode: '',
            message: `Sectie "${section.name}" vereist minimaal ${section.minRows} rijen`,
            type: 'error',
          });
        }
      }

      for (const [rowIndex, rowData] of Object.entries(sectionData)) {
        for (const field of section.fields) {
          const fieldData = rowData[field.code];
          const value = fieldData?.value;

          if (field.isRequired && (value === null || value === undefined || value === '')) {
            errors.push({
              sectionCode: section.code,
              rowIndex,
              fieldCode: field.code,
              message: `Veld "${field.name}" is verplicht`,
              type: 'error',
            });
          }

          if (fieldData?.passFail === 'fail') {
            warnings.push({
              sectionCode: section.code,
              rowIndex,
              fieldCode: field.code,
              message: field.passFailFailMessage || `Veld "${field.name}" voldoet niet aan de pass/fail-criteria`,
              type: 'warning',
            });
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /** Pass/fail evalueren voor alle velden in data. */
  private evaluatePassFail(
    data: Record<
      string,
      Record<string, Record<string, { value: unknown; passFail?: string | null }>>
    >,
    snapshot: ReturnType<typeof this.createTemplateSnapshot>,
  ): Record<string, Record<string, Record<string, FieldValue>>> {
    const result: Record<string, Record<string, Record<string, FieldValue>>> = {};

    for (const section of snapshot.sections) {
      result[section.code] = {};
      const sectionData = data[section.code] || {};

      for (const [rowIndex, rowData] of Object.entries(sectionData)) {
        result[section.code][rowIndex] = {};

        for (const field of section.fields) {
          const fieldData = rowData[field.code];
          const value = fieldData?.value;

          let passFail: 'pass' | 'fail' | null = null;
          if (field.passFailEnabled && value !== null && value !== undefined && value !== '') {
            passFail = this.evaluateFieldPassFail(field, value);
          }

          result[section.code][rowIndex][field.code] = { value, passFail };
        }
      }
    }

    return result;
  }

  private evaluateFieldPassFail(
    field: ReturnType<typeof this.createTemplateSnapshot>['sections'][0]['fields'][0],
    value: unknown,
  ): 'pass' | 'fail' | null {
    if (!field.passFailEnabled || !field.passFailOperator) {
      return null;
    }

    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(numValue)) {
      return null;
    }

    const operator = field.passFailOperator as PassFailOperator;
    const passFailValue = field.passFailValue ? parseFloat(field.passFailValue) : null;
    const passFailMinValue = field.passFailMinValue ? parseFloat(field.passFailMinValue) : null;
    const passFailMaxValue = field.passFailMaxValue ? parseFloat(field.passFailMaxValue) : null;

    switch (operator) {
      case PassFailOperator.GTE:
        return passFailValue !== null && numValue >= passFailValue ? 'pass' : 'fail';
      case PassFailOperator.GT:
        return passFailValue !== null && numValue > passFailValue ? 'pass' : 'fail';
      case PassFailOperator.LTE:
        return passFailValue !== null && numValue <= passFailValue ? 'pass' : 'fail';
      case PassFailOperator.LT:
        return passFailValue !== null && numValue < passFailValue ? 'pass' : 'fail';
      case PassFailOperator.EQ:
        return passFailValue !== null && numValue === passFailValue ? 'pass' : 'fail';
      case PassFailOperator.RANGE:
        return passFailMinValue !== null &&
          passFailMaxValue !== null &&
          numValue >= passFailMinValue &&
          numValue <= passFailMaxValue
          ? 'pass'
          : 'fail';
      case PassFailOperator.IN: {
        const allowedValues = field.passFailValues as (string | number)[] | null;
        return allowedValues && allowedValues.includes(numValue) ? 'pass' : 'fail';
      }
      default:
        return null;
    }
  }

  /** Final-check-regels uit de snapshot draaien. */
  private runFinalCheck(
    record: Awaited<ReturnType<typeof this.getRecordInOrg>>,
  ): FinalCheckResult {
    const snapshot = record.templateSnapshot as unknown as ReturnType<
      typeof this.createTemplateSnapshot
    >;
    const data = record.data as unknown as Record<
      string,
      Record<string, Record<string, FieldValue>>
    >;
    const rules = (snapshot.finalCheckRules ?? []) as Array<{
      type: string;
      config?: Record<string, unknown>;
    }>;

    const results: FinalCheckResult['results'] = [];

    for (const rule of rules) {
      switch (rule.type) {
        case 'allFieldsRequired': {
          let passed = true;
          for (const section of snapshot.sections) {
            const sectionData = data[section.code] || {};
            for (const [, rowData] of Object.entries(sectionData)) {
              for (const field of section.fields) {
                if (field.isRequired) {
                  const value = rowData[field.code]?.value;
                  if (value === null || value === undefined || value === '') {
                    passed = false;
                    break;
                  }
                }
              }
              if (!passed) break;
            }
            if (!passed) break;
          }
          results.push({
            ruleType: 'allFieldsRequired',
            passed,
            message: passed ? undefined : 'Niet alle verplichte velden zijn ingevuld',
          });
          break;
        }

        case 'sectionComplete': {
          const sectionCode = (rule.config?.sectionCode as string) || '';
          const sectionData = data[sectionCode] || {};
          const section = snapshot.sections.find((s) => s.code === sectionCode);

          let passed = true;
          if (section) {
            for (const [, rowData] of Object.entries(sectionData)) {
              for (const field of section.fields) {
                if (field.isRequired) {
                  const value = rowData[field.code]?.value;
                  if (value === null || value === undefined || value === '') {
                    passed = false;
                    break;
                  }
                }
              }
              if (!passed) break;
            }
          }
          results.push({
            ruleType: 'sectionComplete',
            passed,
            message: passed ? undefined : `Sectie "${sectionCode}" is niet compleet`,
            details: { sectionCode },
          });
          break;
        }

        default:
          break;
      }
    }

    const allPassed = results.length === 0 || results.every((r) => r.passed);
    return { passed: allPassed, results };
  }
}
