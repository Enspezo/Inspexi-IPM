import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optionele eigen fallback; krijgt de fout + een reset-callback. Zonder fallback
   * wordt een sobere herlaad-kaart getoond. Apps met eigen foutrapportage (zoals de
   * Beheer-portal) leveren hier hun rapportage-UI aan.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optionele hook voor logging/rapportage van de gevangen fout. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-7 w-7 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          Er is een onverwachte fout opgetreden
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          De pagina kon niet worden geladen. Probeer de pagina opnieuw te laden.
        </p>

        <div className="mb-6 rounded-lg bg-red-50 p-3">
          <p className="break-all font-mono text-xs text-red-700">{error.message}</p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={reset}>
            Opnieuw proberen
          </Button>
          <Button onClick={() => window.location.reload()}>Pagina herladen</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Generieke React error-boundary. Vangt render-fouten in de subtree en toont een
 * fallback i.p.v. een blanco scherm. Herbruikbaar over apps heen (klantportaal
 * gebruikt de default; de Beheer-portal houdt zijn eigen rapportage-boundary).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return this.props.fallback
        ? this.props.fallback(error, this.reset)
        : <DefaultFallback error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}
