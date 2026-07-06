import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { PageHeader } from '@/components/layout/page-header';
import {
  Button,
  StatusBadge,
  Spinner,
  ErrorBox,
  Tabs,
  Table,
  useConfirm,
  useToast,
  type Column,
} from '@/components/ui';
import { HELP_ARTICLE_STATUS } from '@/lib/status';
import { ADMIN_ROLES } from '@/lib/roles';
import { hasRole } from '@/lib/has-role';
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
  const canManage = hasRole(user, ADMIN_ROLES);
  const isSuperuser = hasRole(user, Role.SUPERUSER);

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
      // Backend geeft 400 ("Categorie bevat nog artikelen of subcategorieën") of 403 terug;
      // die servermelding toont de centrale useApiMutation-fallback automatisch.
    });
  };

  const articleColumns: Column<HelpArticle>[] = [
    {
      key: 'title',
      header: 'Titel',
      render: (a) => <span className="font-medium text-gray-900">{a.title}</span>,
    },
    { key: 'category', header: 'Categorie', render: (a) => a.category?.name ?? '—' },
    {
      key: 'scope',
      header: 'Scope',
      render: (a) => (a.orgId ? 'Org-specifiek' : 'Globaal'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <StatusBadge map={HELP_ARTICLE_STATUS} status={a.status} />,
    },
    { key: 'viewCount', header: 'Weergaven', render: (a) => a.viewCount },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (a) => (
        <div className="space-x-2 whitespace-nowrap text-right">
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
        </div>
      ),
    },
  ];

  const categoryColumns: Column<HelpCategory>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (c) => <span className="font-medium text-gray-900">{c.name}</span>,
    },
    {
      key: 'scope',
      header: 'Scope',
      render: (c) => (c.orgId ? 'Org-specifiek' : 'Globaal'),
    },
    {
      key: 'parent',
      header: 'Bovenliggend',
      render: (c) => (c.parentId ? categoryNameById.get(c.parentId) ?? '—' : '—'),
    },
    { key: 'order', header: 'Volgorde', render: (c) => c.order },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) =>
        canManageCategory(c) ? (
          <div className="space-x-2 whitespace-nowrap text-right">
            <Button size="sm" variant="ghost" onClick={() => openEditCat(c)}>
              Bewerken
            </Button>
            <Button size="sm" variant="danger" onClick={() => onDeleteCat(c)}>
              Verwijderen
            </Button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Globaal — alleen-lezen</span>
        ),
    },
  ];

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
        <Table
          columns={articleColumns}
          data={data?.data ?? []}
          keyExtractor={(a) => a.id}
          emptyMessage="Nog geen artikelen. Maak er een aan met “Nieuw artikel”."
        />
      )}

      {tab === 'categories' && (
        <Table
          columns={categoryColumns}
          data={categories ?? []}
          keyExtractor={(c) => c.id}
          emptyMessage="Nog geen categorieën. Maak er een aan met “Nieuwe categorie”."
        />
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
