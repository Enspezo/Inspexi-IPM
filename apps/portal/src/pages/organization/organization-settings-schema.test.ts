import { describe, it, expect, vi } from 'vitest';

// De pagina importeert hooks/providers die in deze schema-test niet nodig zijn.
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/providers/feature-provider', () => ({ useFeatures: () => ({ hasFeature: () => true }) }));
vi.mock('@/pages/inspections/hooks/use-ai-review', () => ({ useAiReviewStatus: () => ({ data: undefined }) }));
vi.mock('./hooks/use-organization', () => ({
  useOrganization: () => ({ data: undefined, isLoading: true }),
  useUpdateOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getLogoUrl: () => null,
}));
vi.mock('@/pages/notifications/hooks/use-notifications', () => ({
  useGroupNotificationPrefs: () => ({ data: undefined, isLoading: true }),
  useSaveGroupNotificationPrefs: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { orgSchema } from './organization-settings-page';
import { ContactDisplayMode } from '@/types';

const base = {
  name: 'InspeXi Demo',
  slug: 'inspexidemo',
  defaultVat: '21',
  defaultValidityDays: '30',
  workdayStart: 8,
  workdayEnd: 17,
  inspectorPhoneDisplay: ContactDisplayMode.NONE,
  inspectorEmailDisplay: ContactDisplayMode.NONE,
  quoteApprovalRequiredRole: '',
  quoteApprovalSelfApprovalAllowed: false,
  chatEnabled: true,
  inspectionReviewEnabled: true,
  aiReviewEnabled: false,
  onlineRepairDefault: false,
};

/**
 * B-508: het oude `z.union([z.coerce.number().min(0), z.literal('')])` maakte
 * van een leeg drempelveld stilzwijgend `0` — `Number('') === 0` wint altijd
 * van de literal-tak. De preprocess moet '' expliciet naar `null` mappen zodat
 * "geen drempel" (null) en "drempel 0" (0) verschillende toestanden blijven.
 */
describe('orgSchema — quoteApprovalThreshold (B-508)', () => {
  it("parseert een leeg veld ('') naar null — NIET naar 0", () => {
    const result = orgSchema.parse({ ...base, quoteApprovalThreshold: '' });
    expect(result.quoteApprovalThreshold).toBeNull();
    expect(result.quoteApprovalThreshold).not.toBe(0);
  });

  it('parseert null naar null', () => {
    const result = orgSchema.parse({ ...base, quoteApprovalThreshold: null });
    expect(result.quoteApprovalThreshold).toBeNull();
  });

  it("parseert een expliciete '0' naar het getal 0 (mét rol — 0 is een échte drempel)", () => {
    const result = orgSchema.parse({
      ...base,
      quoteApprovalThreshold: '0',
      quoteApprovalRequiredRole: 'MANAGER',
    });
    expect(result.quoteApprovalThreshold).toBe(0);
  });

  it("parseert een bedrag ('2500') naar een getal", () => {
    const result = orgSchema.parse({
      ...base,
      quoteApprovalThreshold: '2500',
      quoteApprovalRequiredRole: 'MANAGER',
    });
    expect(result.quoteApprovalThreshold).toBe(2500);
  });

  it('weigert een negatief bedrag', () => {
    const result = orgSchema.safeParse({
      ...base,
      quoteApprovalThreshold: '-5',
      quoteApprovalRequiredRole: 'MANAGER',
    });
    expect(result.success).toBe(false);
  });

  it('vereist een rol zodra er een drempel is ingesteld (ook bij 0)', () => {
    const result = orgSchema.safeParse({
      ...base,
      quoteApprovalThreshold: '0',
      quoteApprovalRequiredRole: '',
    });
    expect(result.success).toBe(false);
  });

  it('vereist géén rol wanneer de drempel leeg is', () => {
    const result = orgSchema.safeParse({ ...base, quoteApprovalThreshold: '' });
    expect(result.success).toBe(true);
  });
});
