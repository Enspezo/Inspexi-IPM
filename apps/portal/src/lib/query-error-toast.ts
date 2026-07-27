// Globale zichtbaarheid van query-fouten (WP-B6 / B-305).
//
// Vóór deze module faalden list-/dropdown-queries volledig stil: TanStack Query
// slikte de fout op en de UI rendert dan een lege lijst zonder foutstate (zo
// bleef de 400 op `limit=200` maandenlang onzichtbaar). Deze module hangt in
// `QueryCache.onError` (zie main.tsx) en maakt élke gefaalde query zichtbaar:
// altijd een `console.error`, en (gededupliceerd) een rode toast.
//
// Overschrijfbaar per query: geef `meta: { suppressErrorToast: true }` mee aan
// `useQuery` wanneer een scherm de fout al zelf afhandelt (inline ErrorBox e.d.)
// en een extra toast dubbel zou zijn. De console.error blijft ook dan staan.
import { QueryCache } from '@tanstack/react-query';
import { ApiClientError, getErrorMessage } from '@/lib/api-client';

type Toaster = (message: string, type?: 'success' | 'error' | 'info') => void;

let toaster: Toaster | null = null;

// Dedupe op melding: bij een storing falen vaak meerdere queries tegelijk met
// dezelfde fout (of blijft een polling-query herhalen) — dan volstaat één toast.
const recentMessages = new Map<string, number>();
export const QUERY_ERROR_TOAST_DEDUPE_MS = 60_000;

/** Geregistreerd door <QueryErrorToastBridge/> (de toast-context leeft ín React). */
export function registerQueryErrorToaster(fn: Toaster | null): void {
  toaster = fn;
}

/** Testhelper: dedupe-geheugen leegmaken. */
export function resetQueryErrorToastDedupe(): void {
  recentMessages.clear();
}

interface QueryLike {
  queryKey?: unknown;
  meta?: Record<string, unknown> | undefined;
}

export function handleQueryError(error: unknown, query: QueryLike): void {
  // Nooit meer stil: de fout is altijd terug te vinden in de console.
  // eslint-disable-next-line no-console
  console.error('[query-error]', query.queryKey, error);

  if (query.meta?.suppressErrorToast === true) return;

  // 401 → de api-client/authflow redirect al naar /login; een toast is dan ruis.
  if (error instanceof ApiClientError && error.statusCode === 401) return;

  const message = `Gegevens laden mislukt: ${getErrorMessage(error, 'onbekende fout')}`;

  const now = Date.now();
  const last = recentMessages.get(message);
  if (last !== undefined && now - last < QUERY_ERROR_TOAST_DEDUPE_MS) return;
  recentMessages.set(message, now);
  for (const [msg, ts] of recentMessages) {
    if (now - ts > QUERY_ERROR_TOAST_DEDUPE_MS) recentMessages.delete(msg);
  }

  toaster?.(message, 'error');
}

/** QueryCache voor de app-brede QueryClient (main.tsx). */
export function createAppQueryCache(): QueryCache {
  return new QueryCache({
    onError: (error, query) => handleQueryError(error, query),
  });
}
