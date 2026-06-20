import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateContactModal } from '@/pages/contacts/components/create-contact-modal';
import { CreateContactPersonModal } from '@/pages/contacts/components/create-contact-person-modal';
import { AddLocationModal } from '@/pages/contacts/components/add-location-modal';
import { CreateRequestModal } from '@/pages/requests/components/create-request-modal';
import { CreateProjectModal } from '@/pages/projects/components/create-project-modal';
import { SelectContactModal } from '@/components/contacts/select-contact-modal';

/** Modal-backed quick-create flows. (Offerte is a route navigation, not a flow.) */
export type QuickCreateFlow =
  | 'contact'
  | 'contactPerson'
  | 'location'
  | 'request'
  | 'project';

interface QuickCreateContextValue {
  open: (flow: QuickCreateFlow) => void;
}

const QuickCreateContext = createContext<QuickCreateContextValue | null>(null);

export function useQuickCreate(): QuickCreateContextValue {
  const ctx = useContext(QuickCreateContext);
  if (!ctx) {
    throw new Error('useQuickCreate must be used within a QuickCreateProvider');
  }
  return ctx;
}

/**
 * Holds the active quick-create flow and renders the create modals once at the
 * app root. Components open a flow via {@link useQuickCreate}. On success each
 * flow navigates to the freshly created record (query invalidation lives in the
 * existing create hooks).
 */
export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [flow, setFlow] = useState<QuickCreateFlow | null>(null);
  // Location needs a relatie first; holds the picked contactId once chosen.
  const [locationContactId, setLocationContactId] = useState<string | null>(null);

  const open = useCallback((next: QuickCreateFlow) => {
    setLocationContactId(null);
    setFlow(next);
  }, []);

  const close = useCallback(() => {
    setFlow(null);
    setLocationContactId(null);
  }, []);

  return (
    <QuickCreateContext.Provider value={{ open }}>
      {children}

      {flow === 'contact' && (
        <CreateContactModal
          isOpen
          onClose={close}
          onCreated={(contact) => {
            close();
            navigate(`/contacts/${contact.id}`);
          }}
        />
      )}

      {flow === 'contactPerson' && (
        <CreateContactPersonModal
          isOpen
          onClose={close}
          onCreated={(contactId) => {
            close();
            navigate(`/contacts/${contactId}`);
          }}
        />
      )}

      {flow === 'request' && (
        <CreateRequestModal
          isOpen
          onClose={close}
          onCreated={(request) => {
            close();
            navigate(`/requests/${request.id}`);
          }}
        />
      )}

      {flow === 'project' && (
        <CreateProjectModal
          onClose={close}
          onCreated={(project) => {
            close();
            navigate(`/projects/${project.id}`);
          }}
        />
      )}

      {flow === 'location' &&
        (locationContactId ? (
          <AddLocationModal
            isOpen
            contactId={locationContactId}
            onClose={close}
            onCreated={(location) => {
              close();
              navigate(`/contacts/locations/${location.id}`);
            }}
          />
        ) : (
          <SelectContactModal
            onSelect={(contactId) => setLocationContactId(contactId)}
            onClose={close}
          />
        ))}
    </QuickCreateContext.Provider>
  );
}
