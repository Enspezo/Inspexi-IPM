/**
 * Replaces {{entity.field}} placeholders in subject and bodyHtml.
 */
export function renderTemplate(
  template: { subject: string; bodyHtml: string },
  variables: Record<string, Record<string, string>>,
): { subject: string; html: string } {
  let subject = template.subject;
  let html = template.bodyHtml;

  for (const [entity, fields] of Object.entries(variables)) {
    for (const [field, value] of Object.entries(fields)) {
      const placeholder = `{{${entity}.${field}}}`;
      subject = subject.replaceAll(placeholder, value ?? '');
      html = html.replaceAll(placeholder, escapeHtml(value ?? ''));
    }
  }

  // Remove unreplaced placeholders
  subject = subject.replace(/\{\{[^}]+\}\}/g, '');
  html = html.replace(/\{\{[^}]+\}\}/g, '');

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wraps template HTML in a standard email layout.
 */
export function wrapInEmailLayout(html: string, orgName?: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      ${html}
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #6B7280; font-size: 12px;">
        Verstuurd via InspeXi Beheer${orgName ? ` door ${orgName}` : ''}
      </p>
    </div>
  `;
}
