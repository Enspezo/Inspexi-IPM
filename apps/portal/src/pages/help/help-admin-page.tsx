import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { PageHeader } from '@/components/layout/page-header';
import {
  Card,
  Button,
  StatusBadge,
  Spinner,
  ErrorBox,
  Tabs,
  useConfirm,
  useToast,
} from '@/components/ui';
import { HELP_ARTICLE_STATUS } from '@/lib/status';
import { ADMIN_ROLES } from '@/lib/roles';
import { HelpArticleStatus, Role, type HelpArticle, type HelpCategory } from '@/types';
import {
  useAdminHelpArticles,
  useHelpCategories,
  usePublishHelpArticle,
  useDeleteHelpArticle,
  useDeleteHelpCategory,
} from './hooks/use-help';
import { ArticleEditorModal } from './components/article-editor-modal';
import { CategoryEditorModal } from './components/category-editor-modal';

type Tab = 'articles' | 'categories';

export default function HelpAdminPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const canManage = !!user?.roles?.some((r) => ADMIN_ROLES.includes(r));
  const isSuperuser = !!user?.roles?.includes(Role.SUPERUSER);

  const { data, isLoading, error } = useAdminHelpArticles(
    { limit: 50 },
    { enabled: canManage },
  );
  const { data: categories } = useHelpCategories();
  const publish = usePublishHelpArticle();
  const remove = useDeleteHelpArticle();
  const removeCategory = useDeleteHelpCategory();

  const [tab, setTab] = useState<Tab>('articles');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const [catEditorOpen, setCatEditorOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<HelpCategory | null>(null);

  if (!canManage) return <ErrorBox>Je hebt geen toegang tot KB-beheer.</ErrorBox>;
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error) return <ErrorBox>Kon artikelen niet laden.</ErrorBox>;

  // Categorie kan alleen beheerd worden door SUPERUSER (alle) of door de eigenaar-org.
  // Globale categorieën zijn voor een ORG_ADMIN alleen-lezen (backend geeft anders 403).
  const canManageCategory = (c: HelpCategory) =>
    isSuperuser || c.orgId === user?.orgId;
  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (a: HelpArticle) => {
    setEditing(a);
    setEditorOpen(true);
  };
  const openNewCat = () => {
    setEditingCat(null);
    setCatEditorOpen(true);
  };
  const openEditCat = (c: HelpCategory) => {
    setEditingCat(c);
    setCatEditorOpen(true);
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

  const onDeleteCat = async (c: HelpCategory) => {
    const ok = await confirm({
      title: 'Categorie verwijderen?',
      message: `"${c.name}" verwijderen? Dit kan alleen als de categorie geen artikelen of subcategorieën meer bevat.`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    removeCategory.mutate(c.id, {
      onSuccess: () => showToast('Categorie verwijderd', 'success'),
      // Backend geeft 400 ("Categorie bevat nog artikelen of subcategorieën") of 403 terug
      onError: (e) =>
        showToast(e instanceof Error ? e.message : 'Verwijderen mislukt', 'error'),
    });
  };

  const tabs = [
    { key: 'articles', label: 'Artikelen', count: data?.total ?? 0 },
    { key: 'categories', label: 'Categorieën', count: categories?.length ?? 0 },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge base — beheer"
        description="Schrijf en publiceer helpartikelen en beheer categorieën."
        actions={
          tab === 'articles' ? (
            <Button onClick={openNew}>Nieuw artikel</Button>
          ) : (
            <Button onClick={openNewCat}>Nieuwe categorie</Button>
          )
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'articles' && (
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
      )}

      {tab === 'categories' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 font-medium">Naam</th>
                  <th className="font-medium">Scope</th>
                  <th className="font-medium">Bovenliggend</th>
                  <th className="font-medium">Volgorde</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories?.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium text-gray-900">{c.name}</td>
                    <td className="text-gray-600">
                      {c.orgId ? 'Org-specifiek' : 'Globaal'}
                    </td>
                    <td className="text-gray-600">
                      {c.parentId ? categoryNameById.get(c.parentId) ?? '—' : '—'}
                    </td>
                    <td className="text-gray-600">{c.order}</td>
                    <td className="space-x-2 whitespace-nowrap py-2 text-right">
                      {canManageCategory(c) ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditCat(c)}
                          >
                            Bewerken
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => onDeleteCat(c)}
                          >
                            Verwijderen
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">
                          Globaal — alleen-lezen
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {categories && categories.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">
                      Nog geen categorieën. Maak er een aan met “Nieuwe categorie”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ArticleEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        article={editing}
        categories={categories ?? []}
      />
      <CategoryEditorModal
        isOpen={catEditorOpen}
        onClose={() => setCatEditorOpen(false)}
        category={editingCat}
        categories={categories ?? []}
      />
    </div>
  );
}
