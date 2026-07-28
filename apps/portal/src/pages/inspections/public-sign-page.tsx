// Publieke ondertekenpagina (geen auth) — bereikbaar via de e-maillink
// /sign/:requestId. Praat met de @Public() signature-requests endpoints.
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner, SignatureCanvas } from '@/components/ui';
import { DocumentType } from '@/types';
import { formatDate } from '@/lib/format';

const API_BASE = '/api/v1';

const DOC_TYPE_LABEL: Record<string, string> = {
  [DocumentType.PLAN]: 'Inspectieplan',
  [DocumentType.REPORT]: 'Inspectierapport',
  [DocumentType.HERSTELVERKLARING]: 'Herstelverklaring',
};

interface SignatureRequestData {
  requestId: string;
  documentId: string;
  documentType: DocumentType;
  projectName: string;
  referenceNumber: string | null;
  signerRoleCode: string;
  signerName: string | null;
  status: string;
  expiresAt?: string;
  html: string;
}

export default function PublicSignPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [data, setData] = useState<SignatureRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    fetch(`${API_BASE}/signature-requests/${requestId}`)
      .then(async (r) => {
        const json = await r.json();
        if (json.success) {
          setData(json.data);
          setSignerName(json.data.signerName ?? '');
        } else {
          setError(json.message || 'Ondertekenverzoek niet gevonden of niet meer geldig');
        }
      })
      .catch(() => setError('Ondertekenverzoek kon niet geladen worden'))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleSign = async () => {
    if (!signature || !signerName.trim() || !requestId) return;
    setSigning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/signature-requests/${requestId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureImage: signature, signerName: signerName.trim() }),
      });
      const json = await res.json();
      if (json.success) setSigned(true);
      else setError(json.message || 'Ondertekenen mislukt');
    } catch {
      setError('Ondertekenen mislukt');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Niet beschikbaar</h1>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const docLabel = DOC_TYPE_LABEL[data.documentType] ?? 'Document';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <header className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">{docLabel} ondertekenen</h1>
          <p className="mt-1 text-sm text-gray-600">
            {data.projectName}
            {data.referenceNumber ? ` · ${data.referenceNumber}` : ''}
          </p>
          {data.expiresAt && (
            <p className="mt-2 text-xs text-gray-400">
              Geldig tot {formatDate(data.expiresAt)}
            </p>
          )}
        </header>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-3 text-sm font-medium text-gray-700">
            Documentinhoud
          </div>
          {/* Eigen document-HTML; sandbox zonder scripts als extra waarborg. */}
          <iframe
            srcDoc={data.html}
            sandbox=""
            title="Documentvoorbeeld"
            className="h-[60vh] w-full bg-white"
          />
        </section>

        {signed ? (
          <section className="rounded-xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-green-800">Bedankt — document ondertekend</h2>
            <p className="mt-1 text-sm text-green-700">
              Uw handtekening is geregistreerd. U kunt dit venster sluiten.
            </p>
          </section>
        ) : (
          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Ondertekenen</h2>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Naam</label>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                placeholder="Uw volledige naam"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Handtekening</label>
              {signature ? (
                <div className="space-y-2">
                  <img
                    src={signature}
                    alt="Handtekening"
                    className="max-h-32 w-full rounded-lg border border-gray-200 object-contain"
                  />
                  <button
                    onClick={() => setSignature(null)}
                    className="text-sm text-red-500 underline hover:text-red-700"
                  >
                    Wissen en opnieuw tekenen
                  </button>
                </div>
              ) : (
                <SignatureCanvas onSave={setSignature} />
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleSign}
              disabled={!signature || !signerName.trim() || signing}
              className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signing ? 'Bezig met ondertekenen...' : 'Document ondertekenen'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
