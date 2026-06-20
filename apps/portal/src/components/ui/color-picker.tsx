interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  error?: string;
  className?: string;
}

/** Veelgebruikte tag-kleuren (Tailwind 500-tinten). */
const PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#6366F1', // indigo
  '#F97316', // orange
  '#6B7280', // gray
];

/** Kleurkiezer met presets + native color input + hex-tekstveld. */
export function ColorPicker({ value, onChange, label, error, className }: ColorPickerProps) {
  return (
    <div className={className}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      )}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
          aria-label="Kies een kleur"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#3B82F6"
          className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm uppercase shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                value.toLowerCase() === color.toLowerCase()
                  ? 'border-gray-800'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Kleur ${color}`}
            />
          ))}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
