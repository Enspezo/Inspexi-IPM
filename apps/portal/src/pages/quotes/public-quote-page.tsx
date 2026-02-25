import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { Quote, QuoteQuestion, QuoteAttachment } from '@/types';
import { QuoteStatus } from '@/types';
import { Spinner, SignatureCanvas, RichTextViewer } from '@/components/ui';

const API_BASE = '/api/v1';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getContactName(contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (!contact) return '';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '';
}


export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Q&A state
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [questionSent, setQuestionSent] = useState(false);

  // Signing state
  const [showSignForm, setShowSignForm] = useState(false);
  const [clientName, setClientName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/public/quotes/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setQuote(json.data);
        } else {
          setError(json.message || 'Offerte niet gevonden');
        }
      })
      .catch(() => setError('Offerte kon niet geladen worden'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSendQuestion = async () => {
    if (!question.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/public/quotes/${token}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question }),
      });
      if (r.ok) {
        setQuestionSent(true);
        setQuestion('');
      }
    } finally {
      setSending(false);
    }
  };

  const handleSign = async () => {
    if (!clientName.trim()) return;
    setSigning(true);
    try {
      const r = await fetch(`${API_BASE}/public/quotes/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, signature: signature ?? undefined }),
      });
      if (r.ok) {
        setSigned(true);
        setShowSignForm(false);
        setQuote((prev) => prev ? { ...prev, status: QuoteStatus.GEACCEPTEERD, clientName, signedAt: new Date().toISOString() } : prev);
      }
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadAttachment = async (att: QuoteAttachment) => {
    const r = await fetch(`${API_BASE}/public/quotes/${token}/attachments/${att.id}/download`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Offerte niet gevonden</h1>
          <p className="text-gray-500">{error || 'De link is mogelijk verlopen of ongeldig.'}</p>
        </div>
      </div>
    );
  }

  const org = (quote as any).organization;
  const primaryColor = org?.primaryColor || '#1E40AF';
  const canSign = (quote.status === QuoteStatus.VERSTUURD || quote.status === QuoteStatus.BEKEKEN) && !quote.signedAt;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header met org branding */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          {org?.logoUrl ? (
            <img src={org.logoUrl} alt={org.name} className="h-10 object-contain" />
          ) : (
            <span className="text-lg font-bold text-gray-900" style={{ color: primaryColor }}>{org?.name || 'InspeXi'}</span>
          )}
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{quote.quoteNumber}</p>
            <p className="text-xs text-gray-500">
              {quote.status === QuoteStatus.GEACCEPTEERD ? '✓ Ondertekend' : quote.validUntil ? `Geldig tot ${formatDate(quote.validUntil)}` : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Titel */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{quote.subject}</h1>
          <p className="mt-1 text-gray-600">
            Aangeboden aan {getContactName(quote.contact)}
            {quote.createdAt && ` · ${formatDate(quote.createdAt)}`}
          </p>
        </div>

        {/* Signed banner */}
        {(quote.status === QuoteStatus.GEACCEPTEERD || signed) && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center">
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-xl font-bold text-emerald-800 mb-1">Offerte geaccepteerd</h2>
            <p className="text-emerald-700">
              {quote.clientName ? `Ondertekend door ${quote.clientName}` : 'Digitaal geaccepteerd'}
              {quote.signedAt ? ` op ${formatDate(quote.signedAt)}` : ''}
            </p>
          </div>
        )}

        {/* Inhoud (contentBlocks) */}
        {quote.contentBlocks && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <RichTextViewer content={quote.contentBlocks as object} />
          </div>
        )}

        {/* Prijsoverzicht */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: `${primaryColor}10` }}>
            <h2 className="text-lg font-semibold text-gray-900">Prijsoverzicht</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Omschrijving</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Aantal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Eenheid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Prijs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Totaal</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {quote.lines?.map((line) => (
                  <tr key={line.id}>
                    <td className="px-6 py-3 text-sm text-gray-900">{line.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{line.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{line.unit}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(line.unitPrice)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex flex-col items-end space-y-1 max-w-xs ml-auto">
              <div className="flex justify-between w-full text-sm">
                <span className="text-gray-500">Subtotaal</span>
                <span className="text-gray-900">{formatCurrency(quote.subtotal)}</span>
              </div>
              {quote.discountTotal > 0 && (
                <div className="flex justify-between w-full text-sm">
                  <span className="text-gray-500">Korting</span>
                  <span className="text-green-600">-{formatCurrency(quote.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between w-full text-sm">
                <span className="text-gray-500">BTW</span>
                <span className="text-gray-900">{formatCurrency(quote.vatTotal)}</span>
              </div>
              <div className="flex justify-between w-full border-t border-gray-300 pt-2">
                <span className="text-base font-semibold text-gray-900">Totaal incl. BTW</span>
                <span className="text-xl font-bold text-gray-900">{formatCurrency(quote.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bijlagen */}
        {(quote.attachments?.length || 0) > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Bijlagen</h2>
            <div className="space-y-2">
              {quote.attachments?.map((att) => (
                <div key={att.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="text-sm text-gray-900">{att.fileName}</span>
                    <span className="text-xs text-gray-400">{formatFileSize(att.fileSize)}</span>
                  </div>
                  <button
                    onClick={() => handleDownloadAttachment(att)}
                    className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Digitaal ondertekenen */}
        {canSign && !signed && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: `${primaryColor}10` }}>
              <h2 className="text-lg font-semibold text-gray-900">Offerte ondertekenen</h2>
              <p className="text-sm text-gray-600 mt-1">Akkoord gaan met deze offerte door uw naam in te vullen en te ondertekenen.</p>
            </div>
            <div className="p-6">
              {!showSignForm ? (
                <button
                  onClick={() => setShowSignForm(true)}
                  className="w-full rounded-xl py-4 text-white font-semibold text-lg transition-colors"
                  style={{ backgroundColor: primaryColor }}
                >
                  ✍️ Offerte accepteren en ondertekenen
                </button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Uw naam <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Voor- en achternaam"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Handtekening (optioneel)</label>
                    {signature ? (
                      <div className="space-y-2">
                        <img src={signature} alt="Handtekening" className="border border-gray-200 rounded-lg max-h-32 w-full object-contain" />
                        <button onClick={() => setSignature(null)} className="text-sm text-red-500 hover:text-red-700 underline">Wissen en opnieuw tekenen</button>
                      </div>
                    ) : (
                      <SignatureCanvas onSave={setSignature} />
                    )}
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                    Door te ondertekenen gaat u akkoord met de offerte. Uw IP-adres en tijdstip worden vastgelegd als audit trail.
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSign}
                      disabled={!clientName.trim() || signing}
                      className="flex-1 rounded-xl py-3 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {signing ? 'Bezig...' : 'Akkoord & ondertekenen'}
                    </button>
                    <button
                      onClick={() => setShowSignForm(false)}
                      className="px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Q&A sectie */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vragen stellen</h2>

          {/* Existing Q&A */}
          {(quote.questions?.length || 0) > 0 && (
            <div className="space-y-3 mb-6">
              {quote.questions?.filter(q => !q.isFromClient || q.isFromClient).map((q: QuoteQuestion) => (
                <div
                  key={q.id}
                  className={`rounded-lg p-3 ${q.isFromClient ? 'bg-gray-50 ml-0 mr-8' : 'bg-blue-50 ml-8 mr-0'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${q.isFromClient ? 'text-gray-600' : 'text-blue-700'}`}>
                      {q.isFromClient ? 'U' : (org?.name || 'Medewerker')}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(q.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{q.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* New question form */}
          {questionSent ? (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-sm font-medium text-green-700">✓ Uw vraag is verstuurd. U ontvangt een e-mail zodra er een antwoord is.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Stel hier uw vraag over de offerte..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <button
                onClick={handleSendQuestion}
                disabled={!question.trim() || sending}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                {sending ? 'Versturen...' : 'Vraag versturen'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-8">
          <p>Aangeboden door {org?.name || 'InspeXi'} via InspeXi Beheer</p>
          {quote.validUntil && <p className="mt-1">Geldig tot {formatDate(quote.validUntil)}</p>}
        </div>
      </main>
    </div>
  );
}
