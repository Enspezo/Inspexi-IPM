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
  type TabDef,
} from '@/components/ui';
import { HELP_ARTICLE_STATUS } from '@/lib/status';
import { ADMIN_ROLES } from '@/lib/roles';
import { hasRole } from '@/lib/has-role';
import { clientPortalArticleUrl } from '@/lib/client-portal';
import {
  HelpArticleStatus,
  HelpAudience,
  Role,
  type HelpArticle,
  type HelpCategory,
} from '@/types';
import {
  useAdminHelpArticles,
  useAdminHelpCategories,
  usePublishHelpArticle,
  useDeleteHelpArticle,
  useDeleteHelpCategory,
} from './hooks/use-help';
import { ArticleEditorModal } from './components/article-editor-modal';
import { CategoryEditorModal } from './components/category-editor-modal';

type Tab = 'articles' | 'global' | 'external' | 'categories';

/** Leesbare scope-aanduiding per artikel/categorie. */
const scopeLabel = (item: { audience: HelpAudience; orgId: string | null }) =>
  item.audience === HelpAudience.EXTERNAL
    ? 'Extern'
    : item.orgId
      ? 'Org-specifiek'
      : 'Globaal';

export default function HelpAdminPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const canManage = hasRole(user, ADMIN_ROLES);
  const isSuperuser = hasRole(user, Role.SUPERUSER);

  const { data, isLoading, error } = useAdminHelpArticles(
    { limit: 50, audience: HelpAudience.INTERNAL },
    { enabled: canManage },
  );
  const { data: externalData } = useAdminHelpArticles(
    { limit: 50, audience: HelpAudience.EXTERNAL },
    { enabled: canManage },
  );
  const { data: categories } = useAdminHelpCategories();
  const publish = usePublishHelpArticle();
  const remove = useDeleteHelpArticle();
  const removeCategory = useDeleteHelpCategory();

  const [tab, setTab] = useState<Tab>('articles');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const [newAudience, setNewAudience] = useState<HelpAudience>(HelpAudience.INTERNAL);
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

  // Categorie/artikel kan alleen beheerd worden door SUPERUSER (alle) of door de eigenaar-org.
  // Globale items zijn voor een ORG_ADMIN alleen-lezen (backend geeft anders 403).
  const canManageCategory = (c: HelpCategory) =>
    isSuperuser || c.orgId === user?.orgId;
  const canManageArticle = (a: HelpArticle) =>
    isSuperuser || a.orgId === user?.orgId;
  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  // Publiek/afgeschermd per categorie — bepaalt de klantportaal-route voor de preview.
  const categoryIsPublicById = new Map(
    (categories ?? []).map((c) => [c.id, c.isPublic]),
  );

  const internalArticles = data?.data ?? [];
  const ownArticles = internalArticles.filter(canManageArticle);
  const globalArticles = internalArticles.filter((a) => !canManageArticle(a));
  const externalArticles = externalData?.data ?? [];

  const openNew = () => {
    setEditing(null);
    setNewAudience(HelpAudience.INTERNAL);
    setEditorOpen(true);
  };
  const openNewExternal = () => {
    setEditing(null);
    setNewAudience(HelpAudience.EXTERNAL);
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

  const articleColumns: Column<HelpArticle>[] = [
    {
      key: 'title',
      header: 'Titel',
      render: (a) => <span className="font-medium text-gray-900">{a.title}</span>,
    },
    { key: 'category', header: 'Categorie', render: (a) => a.category?.name ?? '—' },
    { key: 'scope', header: 'Scope', render: (a) => scopeLabel(a) },
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
      render: (a) =>
        canManageArticle(a) ? (
          <div className="space-x-2 whitespace-nowrap text-right">
            {a.audience === HelpAudience.EXTERNAL &&
              a.status === HelpArticleStatus.PUBLISHED && (
                <a
                  href={clientPortalArticleUrl(
                    a.slug,
                    categoryIsPublicById.get(a.categoryId) ?? false,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Bekijk dit artikel op het klantportaal"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary-600 hover:bg-primary-50"
                >
                  Preview ↗
                </a>
              )}
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
        ) : (
          <span className="text-xs text-gray-400">Globaal — alleen-lezen</span>
        ),
    },
  ];

  const categoryColumns: Column<HelpCategory>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (c) => <span className="font-medium text-gray-900">{c.name}</span>,
    },
    { key: 'scope', header: 'Scope', render: (c) => scopeLabel(c) },
    {
      key: 'access',
      header: 'Toegang',
      render: (c) =>
        c.audience === HelpAudience.EXTERNAL
          ? c.isPublic
            ? 'Publiek'
            : 'Afgeschermd'
          : '—',
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

  const tabs: TabDef<Tab>[] = [
    { key: 'articles', label: 'Artikelen', count: ownArticles.length },
    // Globaal-tab alleen tonen als er globale (alleen-lezen) artikelen zijn.
    ...(globalArticles.length > 0
      ? [{ key: 'global' as const, label: 'Globaal', count: globalArticles.length }]
      : []),
    { key: 'external', label: 'Extern', count: externalArticles.length },
    { key: 'categories', label: 'Categorieën', count: categories?.length ?? 0 },
  ];

  const headerActions =
    tab === 'articles' ? (
      <Button onClick={openNew}>Nieuw artikel</Button>
    ) : tab === 'external' ? (
      <Button onClick={openNewExternal}>Nieuw extern artikel</Button>
    ) : tab === 'categories' ? (
      <Button onClick={openNewCat}>Nieuwe categorie</Button>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge base — beheer"
        description="Schrijf en publiceer helpartikelen (intern én voor het klantportaal) en beheer categorieën."
        actions={headerActions}
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'articles' && (
        <Table
          columns={articleColumns}
          data={ownArticles}
          keyExtractor={(a) => a.id}
          emptyMessage="Nog geen artikelen. Maak er een aan met “Nieuw artikel”."
        />
      )}

      {tab === 'global' && (
        <Table
          columns={articleColumns}
          data={globalArticles}
          keyExtractor={(a) => a.id}
          emptyMessage="Geen globale artikelen."
        />
      )}

      {tab === 'external' && (
        <Table
          columns={articleColumns}
          data={externalArticles}
          keyExtractor={(a) => a.id}
          emptyMessage="Nog geen externe artikelen. Maak er een aan met “Nieuw extern artikel”."
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
        audience={newAudience}
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
