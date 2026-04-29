import { Card, Spinner } from '@/components/ui';
import { useStorageStats } from '../hooks/use-storage-stats';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  CONTACT: 'Contacten',
  REQUEST: 'Aanvragen',
  QUOTE: 'Offertes',
  PRODUCT: 'Producten',
  TASK: 'Taken',
  PLANNING: 'Planning',
};

const COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function PieChart({
  segments,
  usedPercent,
}: {
  segments: { label: string; value: number; color: string }[];
  usedPercent: number;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;

  // If no data, show empty state
  if (segments.length === 0 || segments.every((s) => s.value === 0)) {
    return (
      <div className="flex flex-col items-center gap-3">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={32}
          />
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-gray-400 text-sm font-medium" fontSize="14">
            0%
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-gray-400" fontSize="11">
            gebruikt
          </text>
        </svg>
      </div>
    );
  }

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let currentAngle = -Math.PI / 2; // Start from top

  const paths = segments
    .filter((s) => s.value > 0)
    .map((segment) => {
      const sliceAngle = (segment.value / total) * 2 * Math.PI;
      const startX = cx + radius * Math.cos(currentAngle);
      const startY = cy + radius * Math.sin(currentAngle);
      const endAngle = currentAngle + sliceAngle;
      const endX = cx + radius * Math.cos(endAngle);
      const endY = cy + radius * Math.sin(endAngle);
      const largeArc = sliceAngle > Math.PI ? 1 : 0;

      const d = [
        `M ${cx} ${cy}`,
        `L ${startX} ${startY}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`,
        'Z',
      ].join(' ');

      currentAngle = endAngle;
      return { d, color: segment.color, label: segment.label };
    });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle for unused space */}
        <circle cx={cx} cy={cy} r={radius} fill="#F3F4F6" />
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth={1.5}>
            <title>{p.label}</title>
          </path>
        ))}
        {/* Inner white circle for donut effect */}
        <circle cx={cx} cy={cy} r={48} fill="white" />
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-gray-900 font-semibold" fontSize="18">
          {usedPercent.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-gray-500" fontSize="11">
          gebruikt
        </text>
      </svg>
    </div>
  );
}

export default function QuotaTab() {
  const { data: stats, isLoading } = useStorageStats();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-gray-500 py-12">
        Kon quota-gegevens niet laden.
      </div>
    );
  }

  const usedPercent = stats.quotaBytes > 0 ? (stats.totalBytes / stats.quotaBytes) * 100 : 0;
  const freeBytes = Math.max(0, stats.quotaBytes - stats.totalBytes);

  // Build pie segments from entity types
  const pieSegments = stats.byEntityType.map((et, i) => ({
    label: ENTITY_TYPE_LABELS[et.entityType] || et.entityType,
    value: et.totalBytes,
    color: COLORS[i % COLORS.length],
  }));

  // Sort users by total bytes descending
  const sortedUsers = [...stats.byUser].sort((a, b) => b.totalBytes - a.totalBytes);

  return (
    <div className="space-y-6">
      {/* Quota overview */}
      <Card>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Opslagquotum</h3>
            <p className="mt-1 text-sm text-gray-500">
              {formatBytes(stats.totalBytes)} van {formatBytes(stats.quotaBytes)} gebruikt
              ({stats.totalFiles} {stats.totalFiles === 1 ? 'bestand' : 'bestanden'})
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${
                  usedPercent > 90 ? 'bg-red-500' : usedPercent > 70 ? 'bg-amber-500' : 'bg-primary-600'
                }`}
                style={{ width: `${Math.min(usedPercent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{formatBytes(stats.totalBytes)} gebruikt</span>
              <span>{formatBytes(freeBytes)} beschikbaar</span>
            </div>
          </div>

          {/* Pie chart + legend */}
          <div className="flex flex-col items-center gap-6 pt-4 sm:flex-row sm:items-start sm:justify-center">
            <PieChart segments={pieSegments} usedPercent={usedPercent} />

            {/* Legend */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Per entiteit</h4>
              {pieSegments.length === 0 ? (
                <p className="text-sm text-gray-400">Geen bestanden</p>
              ) : (
                <div className="space-y-1.5">
                  {pieSegments.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-2 text-sm">
                      <span
                        className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-gray-700">{seg.label}</span>
                      <span className="ml-auto text-gray-500">{formatBytes(seg.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Per-user breakdown */}
      <Card>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Gebruik per gebruiker</h3>
            <p className="mt-1 text-sm text-gray-500">
              Overzicht van het aantal bestanden en opslagruimte per gebruiker
            </p>
          </div>

          {sortedUsers.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Nog geen bestanden geüpload.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-2 pr-4 font-medium">Gebruiker</th>
                    <th className="pb-2 pr-4 font-medium text-right">Bestanden</th>
                    <th className="pb-2 pr-4 font-medium text-right">Grootte</th>
                    <th className="pb-2 font-medium text-right">% van quota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedUsers.map((u) => {
                    const pct = stats.quotaBytes > 0 ? (u.totalBytes / stats.quotaBytes) * 100 : 0;
                    return (
                      <tr key={u.userId}>
                        <td className="py-2.5 pr-4">
                          <div className="font-medium text-gray-900">{u.userName}</div>
                          <div className="text-xs text-gray-500">{u.userEmail}</div>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{u.fileCount}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{formatBytes(u.totalBytes)}</td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className="h-full rounded-full bg-primary-500"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-gray-700">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
