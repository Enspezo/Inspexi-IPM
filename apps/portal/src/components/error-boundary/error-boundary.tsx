import React from 'react';
import { Button } from '@/components/ui';
import { ErrorReportModal } from './error-report-modal';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

function ErrorFallback({
  error,
  errorInfo,
}: {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}) {
  const [showReportModal, setShowReportModal] = React.useState(false);

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
          De pagina kon niet worden geladen. Je kunt de pagina opnieuw proberen
          te laden, of een foutmelding sturen naar de helpdesk.
        </p>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-3">
            <p className="text-xs font-mono text-red-700 break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Pagina herladen
          </Button>
          <Button onClick={() => setShowReportModal(true)}>
            Probleem melden
          </Button>
        </div>
      </div>

      <ErrorReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        error={error}
        errorInfo={errorInfo}
      />
    </div>
  );
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
        />
      );
    }

    return this.props.children;
  }
}
