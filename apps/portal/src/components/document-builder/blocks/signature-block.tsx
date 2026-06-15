// ===========================================
// SignatureBlock — Handtekeningvelden-configuratie
// ===========================================

import { SignatureIcon } from '../icons';
import { BlockCallout, ToggleRow } from '../ui';
import type { DocBlockProps, SignatureBlockContent, DocSignerRole } from '../types';

const ROLES: { value: DocSignerRole; label: string }[] = [
  { value: 'inspector', label: 'Inspecteur' },
  { value: 'reviewer', label: 'Controleur' },
  { value: 'client', label: 'Opdrachtgever' },
  { value: 'installation_responsible', label: 'Installatieverantwoordelijke' },
];

export function SignatureBlock({ content, onChange, isReadOnly }: DocBlockProps<SignatureBlockContent>) {
  const roles = content.signerRoles ?? ['inspector', 'reviewer'];
  const showDate = content.showDate ?? true;
  const showFunction = content.showFunction ?? true;

  const toggleRole = (role: DocSignerRole) => {
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    onChange({ ...content, signerRoles: next });
  };

  return (
    <div className="space-y-3">
      <BlockCallout
        tone="gray"
        icon={<SignatureIcon className="h-5 w-5" />}
        title="Handtekeningen"
        subtitle={
          roles.length > 0
            ? roles.map((r) => ROLES.find((x) => x.value === r)?.label).filter(Boolean).join(', ')
            : 'Geen rollen geselecteerd'
        }
      />

      {/* Preview van de handtekeningvakjes */}
      {roles.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {roles.map((role) => {
            const label = ROLES.find((r) => r.value === role)?.label ?? role;
            return (
              <div key={role} className="rounded border border-gray-200 p-3">
                <div className="mb-2 h-10 border-b border-dashed border-gray-300" />
                <p className="text-xs font-medium text-gray-600">{label}</p>
                {showFunction && <p className="text-xs text-gray-400">Functie</p>}
                {showDate && <p className="text-xs text-gray-400">Datum: ___________</p>}
              </div>
            );
          })}
        </div>
      )}

      {!isReadOnly && (
        <div className="space-y-3 px-1">
          <div>
            <label className="mb-2 block text-xs text-gray-600">Ondertekenaars</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((role) => (
                <label key={role.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={roles.includes(role.value)}
                    onChange={() => toggleRole(role.value)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500/20"
                  />
                  <span className="text-xs text-gray-600">{role.label}</span>
                </label>
              ))}
            </div>
          </div>
          <ToggleRow label="Toon datum" checked={showDate} onChange={(v) => onChange({ ...content, showDate: v })} />
          <ToggleRow
            label="Toon functie"
            checked={showFunction}
            onChange={(v) => onChange({ ...content, showFunction: v })}
          />
        </div>
      )}
    </div>
  );
}
