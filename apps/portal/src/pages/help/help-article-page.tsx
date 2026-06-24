import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Spinner, ErrorBox, Button } from '@/components/ui';
import { useHelpArticle, useHelpArticleFeedback } from './hooks/use-help';

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, error } = useHelpArticle(slug!);
  const feedback = useHelpArticleFeedback();
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error || !article) return <ErrorBox>Artikel niet gevonden.</ErrorBox>;

  const sendFeedback = (helpful: boolean) => {
    feedback.mutate(
      { id: article.id, helpful },
      { onSuccess: () => setSubmitted(true) },
    );
  };

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <Link
        to={article.category ? `/help/category/${article.category.slug}` : '/help'}
        className="text-sm text-gray-500 hover:underline"
      >
        ← {article.category ? article.category.name : 'Terug naar helpcentrum'}
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">{article.title}</h1>
        {article.excerpt && <p className="text-gray-600">{article.excerpt}</p>}
      </header>

      <div className="prose max-w-none">
        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{article.body}</ReactMarkdown>
      </div>

      <div className="flex items-center gap-3 border-t pt-4">
        {submitted ? (
          <span className="text-sm text-gray-500">Bedankt voor je feedback!</span>
        ) : (
          <>
            <span className="text-sm text-gray-500">Was dit nuttig?</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => sendFeedback(true)}
              disabled={feedback.isPending}
            >
              Ja
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => sendFeedback(false)}
              disabled={feedback.isPending}
            >
              Nee
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
