import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '@/common/services/storage/storage.interface';
import {
  paginate,
  buildOrderBy,
  orgScope,
  assertFound,
  ORG_ADMINS,
  isSuperuser,
  isManagement,
  hasRole,
  USER_SUMMARY_SELECT,
  assertAllowedPdfOrImageUpload,
} from '@/common';
import {
  CreateInspectorCertificateDto,
  UpdateInspectorCertificateDto,
  ListInspectorCertificatesQueryDto,
} from './dto';

/** Reads always carry a light user-summary so the management overview can label rows. */
const certificateInclude = {
  user: { select: USER_SUMMARY_SELECT },
} satisfies Prisma.InspectorCertificateInclude;

type CertificateWithUser = Prisma.InspectorCertificateGetPayload<{
  include: typeof certificateInclude;
}>;

/** Sortable scalar fields exposed to the list endpoint. */
const ALLOWED_SORT_FIELDS = ['type', 'issuer', 'issueDate', 'validUntil', 'createdAt'];

@Injectable()
export class InspectorCertificatesService {
  private readonly logger = new Logger(InspectorCertificatesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  // ─── Permissions ────────────────────────────────────────
  // canView  = self ∥ {SUPERUSER, ORG_ADMIN, MANAGER}  (MANAGER mag lezen/downloaden)
  // canWrite = self ∥ {SUPERUSER, ORG_ADMIN}           (MANAGER mag NIET schrijven)

  /** True als de actor de certificaten van `targetUserId` mag inzien/downloaden. */
  canView(actor: User, targetUserId: string): boolean {
    return actor.id === targetUserId || isManagement(actor);
  }

  /** True als de actor de certificaten van `targetUserId` mag aanmaken/wijzigen/verwijderen. */
  canWrite(actor: User, targetUserId: string): boolean {
    return actor.id === targetUserId || hasRole(actor, ORG_ADMINS);
  }

  private assertCanView(actor: User, targetUserId: string): void {
    if (!this.canView(actor, targetUserId)) {
      throw new ForbiddenException('Geen toegang tot deze certificaten');
    }
  }

  private assertCanWrite(actor: User, targetUserId: string): void {
    if (!this.canWrite(actor, targetUserId)) {
      throw new ForbiddenException('U mag deze certificaten niet wijzigen');
    }
  }

  // ─── Suggestions (autocomplete) ─────────────────────────

  /** Distinct waarden van `type` of `issuer` binnen de org (optioneel op `q` gefilterd). */
  async getSuggestions(user: User, field: 'type' | 'issuer', q?: string): Promise<string[]> {
    const base: Prisma.InspectorCertificateWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    if (field === 'issuer') {
      const rows = await this.prisma.inspectorCertificate.findMany({
        where: { ...base, ...(q ? { issuer: { contains: q, mode: 'insensitive' } } : {}) },
        select: { issuer: true },
        distinct: ['issuer'],
        orderBy: { issuer: 'asc' },
        take: 20,
      });
      return rows.map((r) => r.issuer);
    }

    const rows = await this.prisma.inspectorCertificate.findMany({
      where: { ...base, ...(q ? { type: { contains: q, mode: 'insensitive' } } : {}) },
      select: { type: true },
      distinct: ['type'],
      orderBy: { type: 'asc' },
      take: 20,
    });
    return rows.map((r) => r.type);
  }

  // ─── Reads ──────────────────────────────────────────────

  async findAll(user: User, query: ListInspectorCertificatesQueryDto) {
    const { userId, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { issueDate: 'desc' });

    const where: Prisma.InspectorCertificateWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    if (userId) {
      // Een expliciet opgevraagde inspecteur mag alleen door self/management.
      this.assertCanView(user, userId);
      where.userId = userId;
    } else if (!isManagement(user)) {
      // Geen userId + geen management → val terug op eigen certificaten.
      where.userId = user.id;
    }
    // Geen userId + management → alle inspecteurs binnen de org (geen extra filter).

    const result = await paginate(this.prisma.inspectorCertificate, {
      where,
      include: certificateInclude,
      orderBy,
      page,
      limit,
    });

    return {
      ...result,
      data: (result.data as CertificateWithUser[]).map((c) => this.serialize(c)),
    };
  }

  async findOne(id: string, user: User) {
    const cert = await this.getOwnedCertificate(id, user);
    this.assertCanView(user, cert.userId);
    return this.serialize(cert);
  }

  /** Bestand-buffer + metadata voor de download-stream. */
  async getDocument(id: string, user: User) {
    const cert = await this.getOwnedCertificate(id, user);
    this.assertCanView(user, cert.userId);
    if (!cert.storageKey || !cert.originalName || !cert.mimeType) {
      throw new NotFoundException('Geen document gekoppeld aan dit certificaat');
    }
    const buffer = await this.storage.download(cert.storageKey);
    return { buffer, certificate: cert };
  }

  // ─── Writes ─────────────────────────────────────────────

  async create(
    file: Express.Multer.File | undefined,
    dto: CreateInspectorCertificateDto,
    user: User,
  ) {
    this.assertCanWrite(user, dto.userId);

    // Doelgebruiker bepaalt de org van het certificaat (een SUPERUSER heeft zelf geen org).
    const target = assertFound(
      await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, orgId: true },
      }),
      'Gebruiker',
    );
    if (!isSuperuser(user) && target.orgId !== user.orgId) {
      throw new ForbiddenException('Gebruiker hoort niet bij uw organisatie');
    }
    const orgId = target.orgId;
    if (!orgId) {
      throw new BadRequestException(
        'Certificaten kunnen alleen voor organisatiegebruikers worden vastgelegd',
      );
    }

    const fileFields = file ? await this.storeFile(orgId, dto.userId, file) : {};

    const created = await this.prisma.inspectorCertificate.create({
      data: {
        orgId,
        userId: dto.userId,
        type: dto.type,
        number: dto.number?.trim() || null,
        issueDate: new Date(dto.issueDate),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        issuer: dto.issuer,
        ...fileFields,
      },
      include: certificateInclude,
    });

    return this.serialize(created);
  }

  async update(
    id: string,
    file: Express.Multer.File | undefined,
    dto: UpdateInspectorCertificateDto,
    user: User,
  ) {
    const cert = await this.getOwnedCertificate(id, user);
    this.assertCanWrite(user, cert.userId);

    const data: Prisma.InspectorCertificateUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.number !== undefined) data.number = dto.number.trim() || null;
    if (dto.issueDate !== undefined && dto.issueDate !== '') {
      data.issueDate = new Date(dto.issueDate);
    }
    if (dto.validUntil !== undefined) {
      data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    }
    if (dto.issuer !== undefined) data.issuer = dto.issuer;

    if (file) {
      const fileFields = await this.storeFile(cert.orgId, cert.userId, file);
      Object.assign(data, fileFields);
      // Vervang het bestaande bestand: ruim de oude opslagsleutel op.
      if (cert.storageKey) await this.safeDelete(cert.storageKey);
    }

    const updated = await this.prisma.inspectorCertificate.update({
      where: { id },
      data,
      include: certificateInclude,
    });

    return this.serialize(updated);
  }

  /** Alleen het gekoppelde bestand verwijderen; het certificaat blijft bestaan. */
  async removeDocument(id: string, user: User) {
    const cert = await this.getOwnedCertificate(id, user);
    this.assertCanWrite(user, cert.userId);
    if (!cert.storageKey) {
      throw new NotFoundException('Geen document gekoppeld aan dit certificaat');
    }
    await this.safeDelete(cert.storageKey);

    const updated = await this.prisma.inspectorCertificate.update({
      where: { id },
      data: {
        storageKey: null,
        fileName: null,
        originalName: null,
        mimeType: null,
        size: null,
      },
      include: certificateInclude,
    });

    return this.serialize(updated);
  }

  /** Soft-delete + opslag-opruiming van het eventuele bestand. */
  async remove(id: string, user: User) {
    const cert = await this.getOwnedCertificate(id, user);
    this.assertCanWrite(user, cert.userId);
    if (cert.storageKey) await this.safeDelete(cert.storageKey);
    await this.prisma.inspectorCertificate.update({
      where: { id },
      data: { isDeleted: true, storageKey: null },
    });
  }

  // ─── Helpers ────────────────────────────────────────────

  /**
   * Fetch a certificate scoped to the caller's org. A cross-tenant id resolves to
   * 404 (existence is not leaked); within-org role checks happen at the call site.
   */
  private async getOwnedCertificate(id: string, user: User): Promise<CertificateWithUser> {
    const cert = await this.prisma.inspectorCertificate.findUnique({
      where: { id },
      include: certificateInclude,
    });
    if (!cert || cert.isDeleted) {
      throw new NotFoundException('Certificaat niet gevonden');
    }
    if (!isSuperuser(user) && cert.orgId !== user.orgId) {
      throw new NotFoundException('Certificaat niet gevonden');
    }
    return cert;
  }

  /** Storage-sleutel: `{orgId}/inspector-certificates/{userId}/{uuid}-{originalName}`. */
  private async storeFile(orgId: string, userId: string, file: Express.Multer.File) {
    // Magic bytes beslissen type + opslagextensie (WP-B4); `originalname`
    // blijft alleen als weergavenaam bewaard.
    const detected = assertAllowedPdfOrImageUpload(file);
    const storageKey = `${orgId}/inspector-certificates/${userId}/${randomUUID()}.${detected.extension}`;
    await this.storage.upload(storageKey, file.buffer, detected.mimeType);
    return {
      storageKey,
      fileName: file.originalname,
      originalName: file.originalname,
      mimeType: detected.mimeType,
      size: file.size,
    };
  }

  /** Best-effort storage delete — a missing blob must never block the DB operation. */
  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn(`Kon certificaatbestand niet verwijderen: ${key}`);
    }
  }

  /**
   * Strip the internal `storageKey` from API output and expose a `hasDocument`
   * flag instead, so the client never sees storage paths.
   */
  private serialize<T extends { storageKey: string | null }>(cert: T) {
    const { storageKey, ...rest } = cert;
    return { ...rest, hasDocument: !!storageKey };
  }
}
