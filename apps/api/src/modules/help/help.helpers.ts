/** Maakt een URL-veilige slug van vrije tekst (NL diacritics → ascii). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 200);
}

/**
 * Garandeert een slug die uniek is binnen zijn scope (`@@unique([orgId, slug])`).
 * `exists` retourneert true als de slug al bezet is binnen de relevante scope
 * (de caller bepaalt de scope én sluit zo nodig het eigen record uit).
 * Botst de basis-slug, dan wordt `-2`, `-3`, … gesuffixt.
 */
export async function uniqueSlug(
  exists: (slug: string) => Promise<boolean>,
  base: string,
): Promise<string> {
  const root = base || 'item';
  let candidate = root;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}
