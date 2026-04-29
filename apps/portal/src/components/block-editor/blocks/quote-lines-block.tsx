import { Input } from '@/components/ui';

interface QuoteLinesBlockProps {
  content: { title?: string };
  onChange: (content: { title: string }) => void;
}

export function QuoteLinesBlock({ content, onChange }: QuoteLinesBlockProps) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-start gap-3">
        {/* Table icon */}
        <div className="flex-shrink-0 mt-1">
          <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          <Input
            label="Titel van de offerteregels"
            value={content.title || 'Offerteregels'}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Bijv. Kostenplaatje, Uw investering..."
          />
          <p className="text-xs text-blue-600">
            Dit blok toont de offerteregels in de uiteindelijke offerte.
          </p>
        </div>
      </div>

      {/* Preview of what the table might look like */}
      <div className="mt-3 rounded border border-blue-200 bg-white p-3">
        <table className="w-full text-xs text-gray-400">
          <thead>
            <tr className="border-b">
              <th className="py-1 text-left font-medium">Omschrijving</th>
              <th className="py-1 text-right font-medium">Aantal</th>
              <th className="py-1 text-right font-medium">Prijs</th>
              <th className="py-1 text-right font-medium">Totaal</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-dashed">
              <td className="py-1">Voorbeeldregel 1</td>
              <td className="py-1 text-right">2</td>
              <td className="py-1 text-right">&euro; 85,00</td>
              <td className="py-1 text-right">&euro; 170,00</td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1">Voorbeeldregel 2</td>
              <td className="py-1 text-right">1</td>
              <td className="py-1 text-right">&euro; 495,00</td>
              <td className="py-1 text-right">&euro; 495,00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
