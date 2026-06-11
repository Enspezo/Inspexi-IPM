import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '@/components/ui';
import { PROJECT_STATUS } from '@/lib/status';
import type { Project } from '@/types';

export function ContactProjectsTab({ projects }: { projects: Project[] }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {projects.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Nog geen projecten voor deze relatie
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Nummer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Titel
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Projectleider
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Startdatum
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-primary-600">
                    {project.projectNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {project.title}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <StatusBadge status={project.status} map={PROJECT_STATUS} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {project.projectManager
                      ? `${project.projectManager.firstName} ${project.projectManager.lastName}`
                      : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {project.startDate
                      ? new Date(project.startDate).toLocaleDateString('nl-NL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
