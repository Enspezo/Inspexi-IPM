import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Spinner, Card, ErrorBox } from '@/components/ui';
import { useKbArticle } from './hooks/use-client-help';

interface Props {
  /** true = publieke variant (zonder login), false/undefined = na klant-login. */
  publicMode?: boolean;
}

export default function KennisbankArticlePage({ publicMode = false }: Props) {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, error } = useKbArticle(slug, publicMode);
  const basePath = publicMode ? '/kennisbank-openbaar' : '/kennisbank';

  return (
    <div className="space-y-6">
      <Link
        to={basePath}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Terug naar kennisbank
      </Link>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <ErrorBox>Dit artikel kon niet worden geladen of bestaat niet.</ErrorBox>
      )}

      {article && (
        <Card>
          {article.category && (
            <p className="text-xs font-medium uppercase tracking-wide text-primary-600">
              {article.category.name}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{article.title}</h1>
          {article.excerpt && (
            <p className="mt-2 text-sm text-gray-600">{article.excerpt}</p>
          )}
          <div className="prose prose-sm mt-6 max-w-none text-gray-800">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
              {article.body}
            </ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
}
