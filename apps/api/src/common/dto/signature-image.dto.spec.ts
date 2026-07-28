// B-404 (WP-C2): élke ondertekenroute moet dezelfde handtekening-validatie dragen.
// Deze spec dwingt dat op twee manieren af:
//  1. gedragsmatig — alle bekende sign-DTO's weigeren onveilige/te grote payloads
//     met de isSafeDataImage-constraint en accepteren een geldige data-URL;
//  2. structureel — elk DTO-bestand onder src/modules dat een `signatureImage`-veld
//     declareert, moet de gedeelde SignatureImageDto extenden. Een nieuwe (vergeten)
//     ondertekenroute faalt hier dus automatisch.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignatureImageDto } from './signature-image.dto';
import { ClientSignDocumentDto } from '../../modules/client-documents/dto';
import { SignRepairDto } from '../../modules/client-repair/dto';
import { SignDocumentDto, PublicSignDto } from '../../modules/generated-documents/dto/generate-document.dto';

const VALID_IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

/** Alle bekende sign-DTO's + de minimale overige velden om ruis in de validatie te vermijden. */
const SIGN_DTOS: Array<{ name: string; dto: new () => object; extra: Record<string, unknown> }> = [
  { name: 'ClientSignDocumentDto (klantportaal)', dto: ClientSignDocumentDto, extra: {} },
  { name: 'SignRepairDto (online herstel)', dto: SignRepairDto, extra: {} },
  { name: 'SignDocumentDto (staf)', dto: SignDocumentDto, extra: { signerRoleCode: 'INSPECTOR' } },
  { name: 'PublicSignDto (publieke ondertekenlink)', dto: PublicSignDto, extra: {} },
];

function signatureErrors(dto: new () => object, payload: Record<string, unknown>) {
  const instance = plainToInstance(dto, payload);
  return validateSync(instance as object).filter((e) => e.property === 'signatureImage');
}

describe('SignatureImageDto — gedeelde handtekening-validatie (B-404)', () => {
  describe.each(SIGN_DTOS)('$name', ({ dto, extra }) => {
    it('extendt de gedeelde SignatureImageDto', () => {
      expect(SignatureImageDto.prototype.isPrototypeOf(dto.prototype)).toBe(true);
    });

    it('accepteert een geldige base64 data-afbeelding', () => {
      expect(signatureErrors(dto, { ...extra, signatureImage: VALID_IMAGE })).toHaveLength(0);
    });

    it('weigert een niet-afbeelding payload (javascript:-URL) met isSafeDataImage', () => {
      const errors = signatureErrors(dto, { ...extra, signatureImage: 'javascript:alert(1)' });
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isSafeDataImage');
      // NL-melding met het toegestane schema + de limiet.
      expect(errors[0].constraints!.isSafeDataImage).toContain('max 5 MB');
    });

    it('weigert een niet-image data-URL (data:text/html)', () => {
      const errors = signatureErrors(dto, { ...extra, signatureImage: 'data:text/html;base64,PGI+' });
      expect(errors[0]?.constraints).toHaveProperty('isSafeDataImage');
    });

    it('weigert een payload groter dan 5 MB gedecodeerd', () => {
      // 7 000 000 base64-tekens ≈ 5,25 MB gedecodeerd > 5 MB-limiet.
      const oversized = `data:image/png;base64,${'A'.repeat(7_000_000)}`;
      const errors = signatureErrors(dto, { ...extra, signatureImage: oversized });
      expect(errors[0]?.constraints).toHaveProperty('isSafeDataImage');
    });

    it('weigert een lege handtekening', () => {
      const errors = signatureErrors(dto, { ...extra, signatureImage: '' });
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isNotEmpty');
    });
  });

  describe('structurele bewaking: geen losse signatureImage-declaraties in module-DTO\'s', () => {
    const MODULES_DIR = join(__dirname, '..', '..', 'modules');
    /** Property-declaratie `signatureImage:` / `signatureImage!:` / `signatureImage?:`. */
    const PROPERTY_RE = /\bsignatureImage\s*[!?]?\s*:/;

    function collectDtoFiles(dir: string, out: string[] = []): string[] {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          collectDtoFiles(full, out);
        } else if (
          entry.endsWith('.ts') &&
          !entry.endsWith('.spec.ts') &&
          /dto/i.test(full.slice(MODULES_DIR.length))
        ) {
          out.push(full);
        }
      }
      return out;
    }

    it('elk DTO-bestand met een signatureImage-veld extendt SignatureImageDto', () => {
      const offenders: string[] = [];
      for (const file of collectDtoFiles(MODULES_DIR)) {
        const source = readFileSync(file, 'utf8');
        if (PROPERTY_RE.test(source) && !source.includes('extends SignatureImageDto')) {
          offenders.push(file.slice(MODULES_DIR.length + 1));
        }
      }
      // Een treffer betekent: een (nieuwe) ondertekenroute declareert zijn eigen
      // signatureImage-veld en mist daarmee @IsSafeDataImage. Extend SignatureImageDto.
      expect(offenders).toEqual([]);
    });

    it('de bekende sign-DTO-bestanden vallen daadwerkelijk binnen de scan (zelftest)', () => {
      const files = collectDtoFiles(MODULES_DIR).map((f) => f.slice(MODULES_DIR.length + 1));
      expect(files).toEqual(
        expect.arrayContaining([
          join('client-documents', 'dto.ts'),
          join('client-repair', 'dto', 'index.ts'),
          join('generated-documents', 'dto', 'generate-document.dto.ts'),
        ]),
      );
    });
  });
});
