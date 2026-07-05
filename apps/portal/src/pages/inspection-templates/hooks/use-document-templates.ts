// ===========================================
// Document-template hooks (plan/rapport per inspectie-template) — Fase 4/5d
// ===========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getAccessToken } from '@/lib/api-client';
import { DocumentType, type DocumentTemplate, type TemplateMode } from '@/types';
import type { DocContentBlock } from '@/components/document-builder';
import { documentTemplateKeys } from '@/lib/query-keys';

const slugFor = (type: DocumentType) => (type === DocumentType.PLAN ? 'plan' : 'report');

export interface UpdateDocumentTemplateInput {
  templateMode?: TemplateMode;
  contentBlocks?: DocContentBlock[];
  pageSize?: string;
  orientation?: string;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  headerHtml?: string;
  footerHtml?: string;
  coverPageHtml?: string;
}

const queryKey = (inspectionTemplateId: string, type: DocumentType) =>
  documentTemplateKeys.detail(inspectionTemplateId, type);

/** Haal de plan- of rapport-template op (get-or-create op de API). */
export function useDocumentTemplate(inspectionTemplateId: string, type: DocumentType) {
  return useQuery<DocumentTemplate>({
    queryKey: queryKey(inspectionTemplateId, type),
    queryFn: () =>
      apiClient.get<DocumentTemplate>(
        `/inspection-templates/${inspectionTemplateId}/${slugFor(type)}-template`,
      ),
    enabled: !!inspectionTemplateId,
  });
}

/** Werk de plan- of rapport-template bij (incl. contentBlocks / templateMode). */
export function useUpdateDocumentTemplate(inspectionTemplateId: string, type: DocumentType) {
  const queryClient = useQueryClient();
  return useMutation<DocumentTemplate, Error, UpdateDocumentTemplateInput>({
    mutationFn: (body) =>
      apiClient.put<DocumentTemplate>(
        `/inspection-templates/${inspectionTemplateId}/${slugFor(type)}-template`,
        body,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey(inspectionTemplateId, type), data);
      queryClient.invalidateQueries({ queryKey: queryKey(inspectionTemplateId, type) });
    },
  });
}

/**
 * HTML-preview ophalen (Fase 4 preview-endpoint). De endpoint levert `text/html`
 * i.p.v. JSON, dus we doen een rauwe fetch (apiClient unwrapt JSON). Als mutation
 * zodat we 'm bewust kunnen triggeren na opslaan.
 */
export function useDocumentTemplatePreview(inspectionTemplateId: string, type: DocumentType) {
  return useMutation<string, Error, void>({
    mutationFn: async () => {
      const token = getAccessToken();
      const res = await fetch(
        `/api/v1/inspection-templates/${inspectionTemplateId}/${slugFor(type)}-template/preview`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error('Voorbeeld kon niet geladen worden');
      return res.text();
    },
  });
}
