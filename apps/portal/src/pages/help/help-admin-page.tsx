import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { PageHeader } from '@/components/layout/page-header';
import {
  Card,
  Button,
  StatusBadge,
  Spinner,
  ErrorBox,
  useConfirm,
  useToast,
} from '@/components/ui';
import { HELP_ARTICLE_STATUS } from '@/lib/status';
import { ADMIN_ROLES } from '@/lib/roles';
import { HelpArticleStatus, type HelpArticle } from '@/types';
import {
  useAdminHelpArticles,
  useHelpCategories,
  usePublishHelpArticle,
  useDeleteHelpArticle,
} from './hooks/use-help';
import { ArticleEditorModal } from './components/article-editor-modal';

export default function HelpAdminPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const canManage = user?.roles?.some((r) => ADMIN_ROLES.includes(r));

  const { data, isLoading, error } = useAdminHelpArticles({ limit: 50 });
  const { data: categories } = useHelpCategories();
  const publish = usePublishHelpArticle();
  const remove = useDeleteHelpArticle();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HelpArticle | null>(null);

  if (!canManage) return <ErrorBox>Je hebt geen toegang tot KB-beheer.</ErrorBox>;
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error) return <ErrorBox>Kon artikelen niet laden.</ErrorBox>;

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (a: HelpArticle) => {
    setEditing(a);
    setEditorOpen(true);
  };

  const onPublish = (a: HelpArticle) =>
    publish.mutate(a.id, {
      onSuccess: () => showToast('Artikel gepubliceerd', 'success'),
      onError: (e) =>
        showToast(e instanceof Error ? e.message : 'Publiceren mislukt', 'error'),
    });

  const onDelete = async (a: HelpArticle) => {
    const ok = await confirm({
      title: 'Verwijderen?',
      message: `"${a.title}" verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    remove.mutate(a.id, {
      onSuccess: () => showToast('Artikel verwijderd', 'success'),
      onError: (e) =>
        showToast(e instanceof Error ? e.message : 'Verwijderen mislukt', 'error'),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge base — beheer"
        description="Schrijf en publiceer helpartikelen."
        actions={<Button onClick={openNew}>Nieuw artikel</Button>}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 font-medium">Titel</th>
                <th className="font-medium">Categorie</th>
                <th className="font-medium">Scope</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">Weergaven</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.data.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 font-medium text-gray-900">{a.title}</td>
                  <td className="text-gray-600">{a.category?.name ?? '—'}</td>
                  <td className="text-gray-600">
                    {a.orgId ? 'Org-specifiek' : 'Globaal'}
                  </td>
                  <td>
                    <StatusBadge map={HELP_ARTICLE_STATUS} status={a.status} />
                  </td>
                  <td className="text-gray-600">{a.viewCount}</td>
                  <td className="space-x-2 whitespace-nowrap py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                      Bewerken
                    </Button>
                    {a.status !== HelpArticleStatus.PUBLISHED && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onPublish(a)}
                        disabled={publish.isPending}
                      >
                        Publiceren
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => onDelete(a)}>
                      Verwijderen
                    </Button>
                  </td>
                </tr>
              ))}
              {data && data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    Nog geen artikelen. Maak er een aan met “Nieuw artikel”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ArticleEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        article={editing}
        categories={categories ?? []}
      />
    </div>
  );
}
