import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient, downloadFromPath } from '@inspexi/shared-web';
import { apiClient } from '@/lib/api-client';
import { repairSessionKeys } from '@/lib/query-keys';
import {
  clearRepairToken,
  getRepairToken,
  hasRepairToken,
  setRepairToken,
} from '@/lib/repair-token';
import type {
  RepairClaimResult,
  RepairCompleteResult,
  RepairResolutionPhoto,
  RepairSessionStartResult,
  RepairSessionView,
  RepairSignResult,
} from '@/types';

// ── Herstel-api-client (PRD-14) ─────────────────────────────────────────────
//
// De herstel-endpoints authenticeren met het SESSIETOKEN (RepairSessionGuard),
// niet met het klant-JWT. Daarom een eigen api-client-instantie op de gedeelde
// kern (@inspexi/shared-web) met `getToken: getRepairToken`. Een 401 betekent
// hier "sessie verlopen/ongeldig" — er is géén refresh-mechanisme: token wissen,
// event uitsturen (voor de redirect naar /herstel) en de server-fout laten
// propageren (NL-melding uit de RepairSessionGuard).

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const REPAIR_SESSION_EXPIRED_MESSAGE =
  'Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode.';

const REPAIR_SESSION_EXPIRED_EVENT = 'repair-session:expired';

const repairApiClient = createApiClient({
  baseUrl: BASE_URL,
  getToken: getRepairToken,
  onUnauthorized: async () => {
    clearRepairToken();
    window.dispatchEvent(new CustomEvent(REPAIR_SESSION_EXPIRED_EVENT));
    return null; // geen retry — de 401-serverfout (NL) valt door naar de aanroeper
  },
});

/**
 * Redirect naar /herstel zodra de herstelsessie verlopen/ongeldig blijkt (401 op
 * een willekeurige herstel-call). Gebruiken op elke pagina achter de sessie.
 */
export function useRepairSessionExpiredRedirect(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = () => {
      navigate('/herstel', {
        replace: true,
        state: { message: REPAIR_SESSION_EXPIRED_MESSAGE },
      });
    };
    window.addEventListener(REPAIR_SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(REPAIR_SESSION_EXPIRED_EVENT, handler);
  }, [navigate]);
}

// ── Sessie starten ──────────────────────────────────────────────────────────

function useStoreSession() {
  const qc = useQueryClient();
  return (result: RepairSessionStartResult) => {
    setRepairToken(result.token);
    const { token: _token, expiresAt: _expiresAt, ...view } = result;
    qc.setQueryData<RepairSessionView>(repairSessionKeys.all, view);
  };
}

/** Anonieme toegang: rapportnummer + postcode → sessie + token (PRD §14.9.1). */
export function useRepairLookup() {
  const store = useStoreSession();
  return useMutation({
    // Publieke route — de gewone apiClient volstaat (een eventueel klant-JWT wordt genegeerd).
    mutationFn: (body: { referenceNumber: string; postalCode: string }) =>
      apiClient.post<RepairSessionStartResult>('/client/repair/lookup', body),
    onSuccess: store,
  });
}

/** Ingelogde klant start een CLIENT_USER-sessie op een toegankelijk plan (PRD §14.9.5). */
export function useStartRepairSession() {
  const store = useStoreSession();
  return useMutation({
    // Klant-JWT-route — via de gewone apiClient (met refresh-afhandeling).
    mutationFn: (inspectionPlanId: string) =>
      apiClient.post<RepairSessionStartResult>('/client/repair/sessions', { inspectionPlanId }),
    onSuccess: store,
  });
}

// ── Sessie-overzicht ────────────────────────────────────────────────────────

export function useRepairSession() {
  return useQuery<RepairSessionView>({
    queryKey: repairSessionKeys.all,
    queryFn: () => repairApiClient.get<RepairSessionView>('/client/repair/session'),
    enabled: hasRepairToken(),
  });
}

// ── Mutaties (claim, foto's, afronden, ondertekenen) ────────────────────────

/**
 * Herstelmelding (claim, first-wins). Een 409 betekent: een andere partij was
 * eerder — de eigen invoer is server-side bewaard als CONFLICT-concept; de
 * aanroeper toont de servermelding en refetcht het overzicht.
 */
export function useClaimFinding() {
  return useMutation({
    mutationFn: ({ findingId, description }: { findingId: string; description: string }) =>
      repairApiClient.post<RepairClaimResult>(`/client/repair/findings/${findingId}/resolve`, {
        description,
      }),
  });
}

/** Bewijsfoto's bij de eigen melding (werkt voor REPORTED én CONFLICT, max 5). */
export function useUploadResolutionPhotos() {
  return useMutation({
    mutationFn: ({ findingId, files }: { findingId: string; files: File[] }) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('photos', file));
      return repairApiClient.upload<RepairResolutionPhoto[]>(
        `/client/repair/findings/${findingId}/resolve/photos`,
        formData,
      );
    },
  });
}

/** Herlaadt het sessie-overzicht (na claim/foto-upload/afronden). */
export function useInvalidateRepairSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: repairSessionKeys.all });
}

/** Afronden stap 3: selectie + gegevens → concept-herstelverklaring (htmlPreview). */
export function useCompleteRepair() {
  return useMutation({
    mutationFn: (body: {
      resolutionIds: string[];
      contactName: string;
      companyName?: string;
      email?: string;
    }) => repairApiClient.post<RepairCompleteResult>('/client/repair/complete', body),
  });
}

/** Afronden stap 4: ondertekenen → SIGNED + PDF; sessie wordt COMPLETED. */
export function useSignRepair() {
  const invalidate = useInvalidateRepairSession();
  return useMutation({
    mutationFn: (signatureImage: string) =>
      repairApiClient.post<RepairSignResult>('/client/repair/sign', { signatureImage }),
    onSuccess: () => invalidate(),
  });
}

// ── Geauthenticeerde media (foto's + PDF) ───────────────────────────────────

/**
 * Foto's hangen achter het sessie-gescopede endpoint (Bearer-sessietoken), dus
 * een directe <img src> werkt niet. Haal de blobs op met het token en geef
 * tijdelijke object-URL's terug (zelfde patroon als finding-detail-modal).
 */
export function useRepairBlobUrls(urls: string[]): (string | null)[] {
  const key = urls.join('|');
  const [resolved, setResolved] = useState<(string | null)[]>(() => urls.map(() => null));

  useEffect(() => {
    let active = true;
    const created: string[] = [];
    const token = getRepairToken();
    Promise.all(
      urls.map((u) =>
        fetch(u, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch'))))
          .then((b) => {
            const obj = URL.createObjectURL(b);
            created.push(obj);
            return obj;
          })
          .catch(() => null),
      ),
    ).then((list) => {
      if (active) setResolved(list);
    });
    return () => {
      active = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}

/** Authenticated download van de ondertekende herstelverklaring-PDF. */
export function downloadRepairDeclarationPdf(): Promise<void> {
  return downloadFromPath('/client/repair/declaration/pdf', 'herstelverklaring.pdf', {
    baseUrl: BASE_URL,
    getToken: getRepairToken,
  });
}
