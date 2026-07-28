import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';

/**
 * Drop-in vervanger voor TanStack's `useMutation` met gedeelde, overschrijfbare
 * foutafhandeling. De generieke parameters staan in dezelfde volgorde als bij
 * `useMutation` (`TData, TError, TVariables, TContext`), zodat bestaande
 * call-sites 1-op-1 kunnen overschakelen.
 *
 * Als de aanroeper zélf geen `onError` meegeeft, toont deze hook automatisch een
 * Nederlandse error-toast: de servermelding (via `getErrorMessage`, bv. uit
 * `assertFound`/FK-validatie) of anders de fallback "Er is iets misgegaan". Zo
 * blijft geen enkele mutatie zonder foutfeedback achter.
 *
 * De default is volledig overschrijfbaar: geef een eigen `onError` mee (bv. voor
 * een optimistic-update rollback of inline foutweergave) en de default vuurt
 * niet — er ontstaat dus nooit een dubbele toast. Componenten die hun eigen
 * error-toast toonden kunnen die daardoor laten vallen.
 */
export function useApiMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { showToast } = useToast();

  return useMutation<TData, TError, TVariables, TContext>({
    ...options,
    onError:
      options.onError ??
      ((error) => {
        showToast(getErrorMessage(error, 'Er is iets misgegaan'), 'error');
      }),
  });
}
