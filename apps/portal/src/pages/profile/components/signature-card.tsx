import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Card, Button, SignatureEditor, useToast } from '@/components/ui';
import { SignatureType } from '@/types';
import { useSignature, useSaveSignature, useDeleteSignature } from '../hooks/use-signature';
import { getErrorMessage } from '@/lib/api-client';

// ─── Signature Card Component ─────────────────────────────

const SCRIPT_FONTS_PREVIEW = [
  { family: "'Dancing Script', cursive" },
  { family: "'Great Vibes', cursive" },
  { family: "'Alex Brush', cursive" },
  { family: "'Pacifico', cursive" },
];

export function SignatureCard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: signature, isLoading } = useSignature();
  const saveMutation = useSaveSignature();
  const deleteMutation = useDeleteSignature();
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async (type: SignatureType, data: string) => {
    try {
      await saveMutation.mutateAsync({ signatureType: type, signatureData: data });
      showToast('Handtekening opgeslagen', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      showToast('Handtekening verwijderd', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  if (isLoading) {
    return (
      <Card title="Standaard handtekening">
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          Laden...
        </div>
      </Card>
    );
  }

  const hasSignature = signature?.signatureType && signature?.signatureData;

  // Render existing signature preview
  const renderPreview = () => {
    if (!signature?.signatureType || !signature?.signatureData) return null;

    if (signature.signatureType === SignatureType.DRAW || signature.signatureType === SignatureType.UPLOAD) {
      return (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-4">
          <img
            src={signature.signatureData}
            alt="Handtekening"
            className="max-h-20 max-w-full object-contain"
          />
        </div>
      );
    }

    if (signature.signatureType === SignatureType.TEXT) {
      try {
        const parsed = JSON.parse(signature.signatureData);
        return (
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-4">
            <span
              className="text-3xl text-gray-800"
              style={{ fontFamily: parsed.font || SCRIPT_FONTS_PREVIEW[0].family }}
            >
              {parsed.text}
            </span>
          </div>
        );
      } catch {
        return null;
      }
    }

    return null;
  };

  return (
    <Card title="Standaard handtekening">
      <p className="mb-4 text-sm text-gray-500">
        Sla een standaard handtekening op die u kunt hergebruiken bij het goedkeuren van offertes.
      </p>

      {!isEditing ? (
        <div className="space-y-3">
          {hasSignature ? (
            <>
              {renderPreview()}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Type: {signature.signatureType === SignatureType.DRAW ? 'Getekend' : signature.signatureType === SignatureType.UPLOAD ? 'Afbeelding' : 'Tekst'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-medium text-primary-600 hover:text-primary-800 underline"
                  >
                    Wijzigen
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-xs font-medium text-red-500 hover:text-red-700 underline disabled:opacity-50"
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-8">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <p className="text-sm text-gray-500">Nog geen handtekening ingesteld</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Handtekening instellen
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <SignatureEditor
            onSave={handleSave}
            initialType={signature?.signatureType ?? null}
            initialData={signature?.signatureData ?? null}
            isSaving={saveMutation.isPending}
            userName={user ? `${user.firstName} ${user.lastName}` : ''}
          />
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Annuleren
          </button>
        </div>
      )}
    </Card>
  );
}
