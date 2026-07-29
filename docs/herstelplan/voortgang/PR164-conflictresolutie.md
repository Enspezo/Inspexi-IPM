# PR #164 (`fix/wp-b4-upload-security-sweep`) — conflictresolutie

De branch is afgetakt vóór golf 3/4 (merge-base = PR #137) en botst daardoor op vier bestanden met werk uit WP-B3, WP-B7 en WP-C5. Alle vier zijn opgelost; de merge introduceert **geen** nieuwe typefouten.

**Verificatie:** `tsc --noEmit` op de merge levert exact dezelfde 7 fouten als op kale `dev` (byte-identieke output). Die 7 zijn omgevingsruis, geen code-defect: `helmet` ontbreekt in de lokaal geïnstalleerde `node_modules` en de Prisma-client is nog van een oudere schemaversie (`quoteApprovalSelfApprovalAllowed`, `SyncQueue.orgId`). Na `pnpm install` + `prisma generate` verdwijnen ze.

---

## De vier conflicten

### 1–3 · Import-unions (triviaal)

Beide kanten voegden imports toe aan dezelfde regel. Oplossing: alles behouden.

| Bestand | `dev` bracht | branch bracht |
|---|---|---|
| `apps/api/src/modules/email-templates/email-templates.service.ts` | `requireOrg` | `assertAllowedAttachmentUpload` |
| `apps/api/src/modules/quote-templates/quote-templates.service.ts` | `requireOrg` | `assertAllowedImageUpload`, `assertAllowedAttachmentUpload`, `assertUploadContentMatchesClaim` |
| `apps/api/src/modules/quotes/quote-attachments.service.ts` | `publicTenantWhere` + `TenantContext` + `EntitlementsService` | `assertAllowedAttachmentUpload` |

Gecontroleerd: `requireOrg` wordt in beide services daadwerkelijk aangeroepen, dus de import blijft nodig (geen dode import).

### 4 · `apps/api/src/modules/quotes/quotes.controller.ts` — echte botsing

Dit is de enige inhoudelijke: **WP-B7 (B-152, tenantbinding)** en **WP-B4 (B-507, geharde headers)** wijzigden hetzelfde blok.

- `dev` gaf `tenant` mee aan `downloadPublicAttachment(token, attachmentId, tenant)` en zette de headers inline.
- De branch verving de inline headers door `setBinaryResponseHeaders(...)` (attachment + nosniff + sandbox + `no-store`) maar kende de `tenant`-parameter niet.

Beide zijn nodig — de één bindt de token aan het subdomein, de ander maakt de bijlage inert. Resolutie behoudt allebei:

```ts
const { buffer, attachment } = await this.attachmentsService.downloadPublicAttachment(
  token,
  attachmentId,
  tenant,
);
// Publieke route: bijlagen van vóór de upload-whitelist kunnen elk type
// bevatten — attachment + nosniff + sandbox houden ze inert (WP-B4).
// De tenantbinding (WP-B7/B-152) zit in downloadPublicAttachment zelf.
setBinaryResponseHeaders(res, {
  mimeType: attachment.mimeType,
  contentLength: buffer.length,
  filename: sanitizeDispositionFilename(attachment.fileName),
  disposition: 'attachment',
  cacheControl: 'private, no-store',
});
```

De service zelf was al correct auto-gemerged: `downloadPublicAttachment` houdt zowel `publicTenantWhere(tenant, …)` + `assertFeature` als de nieuwe upload-validatie.

---

## Toepassen

**Optie A — bundle (behoudt de exacte resolutie).** Het bestand `wp-b4-merge.bundle` bevat één merge-commit bovenop `e38beaf` (dev) en `d8aad86` (de branch); beide zitten al in je repo.

```bash
cd /pad/naar/InspeXi-Beheer
git fetch /pad/naar/wp-b4-merge.bundle mergetest:wp-b4-merged
git checkout dev
git merge --ff-only wp-b4-merged
git push origin dev            # of: PR #164 hierop bijwerken
```

**Optie B — zelf mergen.** Git produceert exact dezelfde vier conflicten; los ze op zoals hierboven.

```bash
git checkout dev
git merge origin/fix/wp-b4-upload-security-sweep
# 4 conflicten → union voor de drie imports, gecombineerd blok voor quotes.controller.ts
git add -A && git commit
```

> Let op bij optie B: commit géén `node_modules`-symlinks mee als je met een losse checkout werkt.

---

## Vóór de merge live gaat

1. **`pnpm install`** — de branch voegt `helmet` toe (WP-B4 hardening in `main.ts`); zonder install faalt de build.
2. **`prisma generate`** — niet strikt nodig voor deze merge, maar wel om de 7 omgevingsfouten weg te krijgen.
3. **Draai de nieuwe suite** `apps/api/test/upload-security-sweep.e2e-spec.ts` (459 regels, hoort bij deze branch) plus de aangepaste `documents`/`photos`/`document-tags` e2e's.
4. **Hertest de publieke offerte-bijlage** (PUB-01/02 uit het testprogramma): downloaden moet werken op het juiste subdomein, en 404 geven vanaf een vreemd subdomein — dat is precies het snijvlak dat conflict 4 raakte.

Na deze merge is **B-507 volledig dicht**: de resterende uploadroutes (documents, photos, location-images, certificates, quote-templates) valideren dan op inhoud in plaats van op `file.mimetype`, en quote-templates serveert geen SVG meer.
