import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner, Card, ErrorBox, Input } from '@/components/ui';
import { useKbCategories, type KbCategory } from './hooks/use-client-help';

interface Props {
  /** true = publieke variant (zonder login), false/undefined = na klant-login. */
  publicMode?: boolean;
}

export default function KennisbankPage({ publicMode = false }: Props) {
  const { data, isLoading, error } = useKbCategories(publicMode);
  const [search, setSearch] = useState('');
  const basePath = publicMode ? '/kennisbank-openbaar' : '/kennisbank';

  const categories = useMemo(() => {
    const all = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    // Filter op categorienaam of artikeltitel/-samenvatting.
    return all
      .map((c) => ({
        ...c,
        articles: c.articles.filter((a) =>
          [a.title, a.excerpt, c.name]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.name.toLowerCase().includes(q) || c.articles.length > 0);
  }, [data, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kennisbank</h1>
        <p className="mt-1 text-sm text-gray-600">
          Antwoorden op veelgestelde vragen en uitleg over het portaal.
        </p>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Zoeken in de kennisbank…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <ErrorBox>Kon de kennisbank niet laden. Probeer het later opnieuw.</ErrorBox>
      )}

      {data && categories.length === 0 && (
        <Card>
          <p className="py-10 text-center text-sm text-gray-500">
            {search
              ? 'Geen artikelen gevonden voor deze zoekopdracht.'
              : 'Er zijn nog geen artikelen beschikbaar.'}
          </p>
        </Card>
      )}

      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} basePath={basePath} />
      ))}
    </div>
  );
}

function CategoryCard({
  category,
  basePath,
}: {
  category: KbCategory;
  basePath: string;
}) {
  return (
    <Card>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{category.name}</h2>
        {category.description && (
          <p className="mt-0.5 text-sm text-gray-600">{category.description}</p>
        )}
      </div>
      {category.articles.length === 0 ? (
        <p className="text-sm text-gray-500">Nog geen artikelen in deze categorie.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {category.articles.map((article) => (
            <Link
              key={article.id}
              to={`${basePath}/${article.slug}`}
              className="flex items-start justify-between gap-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{article.title}</p>
                {article.excerpt && (
                  <p className="mt-0.5 text-sm text-gray-500">{article.excerpt}</p>
                )}
              </div>
              <svg
                className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
