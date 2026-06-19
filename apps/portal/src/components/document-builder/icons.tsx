// ===========================================
// Document Builder — Inline SVG icons
// ===========================================
//
// De Beheer-portal gebruikt GEEN lucide-react; alle iconen zijn inline SVG
// (heroicons-outline-stijl), net als in de bestaande quote-block-editor.

type IconProps = { className?: string };

const base = (className?: string) => ({
  className: className ?? 'h-4 w-4',
  fill: 'none' as const,
  viewBox: '0 0 24 24',
  stroke: 'currentColor' as const,
});

export function TextIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  );
}

export function ImageIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export function DividerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14" />
    </svg>
  );
}

export function SpacerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7l4-4 4 4M8 17l4 4 4-4M12 3v18" />
    </svg>
  );
}

export function PlaceholderIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 4H7a2 2 0 00-2 2v3a2 2 0 01-2 2 2 2 0 012 2v3a2 2 0 002 2h1M16 4h1a2 2 0 012 2v3a2 2 0 002 2 2 2 0 00-2 2v3a2 2 0 01-2 2h-1" />
    </svg>
  );
}

export function TocIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function TableIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-8v12m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

export function PackageIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6m4 6V5m4 14v-9M5 19h14" />
    </svg>
  );
}

export function SignatureIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

export function GripIcon({ className }: IconProps) {
  return (
    <svg className={className ?? 'h-4 w-4'} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.2" />
      <circle cx="11" cy="3" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="13" r="1.2" />
      <circle cx="11" cy="13" r="1.2" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export function ColumnsIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h6a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v14a1 1 0 01-1 1h-5a1 1 0 01-1-1V5z" />
    </svg>
  );
}

export function SquareIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
    </svg>
  );
}

export function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

/** Icon-map gebruikt door de block-registry (key → component). */
export const BLOCK_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  text: TextIcon,
  image: ImageIcon,
  divider: DividerIcon,
  spacer: SpacerIcon,
  placeholder: PlaceholderIcon,
  toc: TocIcon,
  table: TableIcon,
  package: PackageIcon,
  chart: ChartIcon,
  signature: SignatureIcon,
};
