import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Card, Input, Spinner, ErrorBox } from '@/components/ui';
import { useHelpCategories, useHelpCategory, useHelpArticles } from './hooks/use-help';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function HelpCenterPage() {
  const { slug } = useParams<{ slug?: string }>();
  return slug ? <CategoryView slug={slug} /> : <CenterView />;
}

function CenterView() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const { data: categories, isLoading, error } = useHelpCategories();
  const { data: results } = useHelpArticles({
    search: debouncedSearch || undefined,
    limit: 10,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error) return <ErrorBox>Kon het helpcentrum niet laden.</ErrorBox>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Helpcentrum"
        description="Doorzoek artikelen of blader per categorie."
      />

      <Input
        placeholder="Zoek in de helpartikelen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {debouncedSearch && (
        <Card title="Zoekresultaten">
          <ul className="divide-y divide-gray-100">
            {results?.data.map((a) => (
              <li key={a.id} className="py-2">
                <Link
                  to={`/help/article/${a.slug}`}
                  className="font-medium text-primary-600 hover:underline"
                >
                  {a.title}
                </Link>
                {a.excerpt && <p className="text-sm text-gray-600">{a.excerpt}</p>}
              </li>
            ))}
            {results && results.data.length === 0 && (
              <li className="py-2 text-sm text-gray-500">
                Geen resultaten — probeer andere zoekwoorden.
              </li>
            )}
          </ul>
        </Card>
      )}

      {!debouncedSearch && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories?.map((c) => (
            <Link key={c.id} to={`/help/category/${c.slug}`} className="block">
              <Card className="h-full transition hover:shadow-md">
                <h3 className="font-semibold text-gray-900">{c.name}</h3>
                {c.description && (
                  <p className="mt-1 text-sm text-gray-600">{c.description}</p>
                )}
              </Card>
            </Link>
          ))}
          {categories && categories.length === 0 && (
            <p className="text-sm text-gray-500">Er zijn nog geen categorieën.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryView({ slug }: { slug: string }) {
  const { data: category, isLoading, error } = useHelpCategory(slug);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error || !category) return <ErrorBox>Categorie niet gevonden.</ErrorBox>;

  return (
    <div className="space-y-6">
      <Link to="/help" className="text-sm text-gray-500 hover:underline">
        ← Terug naar helpcentrum
      </Link>
      <PageHeader title={category.name} description={category.description ?? undefined} />
      <Card>
        <ul className="divide-y divide-gray-100">
          {category.articles?.map((a) => (
            <li key={a.id} className="py-2">
              <Link
                to={`/help/article/${a.slug}`}
                className="font-medium text-primary-600 hover:underline"
              >
                {a.title}
              </Link>
              {a.excerpt && <p className="text-sm text-gray-600">{a.excerpt}</p>}
            </li>
          ))}
          {(!category.articles || category.articles.length === 0) && (
            <li className="py-2 text-sm text-gray-500">
              Nog geen artikelen in deze categorie.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
