import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '@/common/decorators';
import { PlanningService } from './planning.service';
import { PlanningIcalService } from './planning-ical.service';
import { AddQuestionDto, CreateRescheduleRequestDto } from './dto';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';
import { Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma';

@ApiTags('Planning (public)')
@Public()
@Controller('public/planning')
export class PlanningPublicController {
  constructor(
    private readonly service: PlanningService,
    private readonly icalService: PlanningIcalService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'Afspraakdetails ophalen (publiek)' })
  async findByToken(@Param('token') token: string) {
    const data = await this.service.findByPublicToken(token);
    return { success: true, data };
  }

  @Post(':token/questions')
  @ApiOperation({ summary: 'Vraag stellen als klant (publiek)' })
  @HttpCode(HttpStatus.CREATED)
  async addClientQuestion(@Param('token') token: string, @Body() dto: AddQuestionDto) {
    const data = await this.service.addClientQuestion(token, dto);
    return { success: true, data };
  }

  @Post(':token/reschedule-request')
  @ApiOperation({ summary: 'Afspraak verzetverzoek indienen (klant, publiek)' })
  @HttpCode(HttpStatus.CREATED)
  async createRescheduleRequest(
    @Param('token') token: string,
    @Body() dto: CreateRescheduleRequestDto,
  ) {
    const data = await this.service.createRescheduleRequest(token, dto);
    return { success: true, data };
  }

  @Get(':token/documents')
  @ApiOperation({ summary: 'Gedeelde bijlagen ophalen (publiek)' })
  async getSharedDocuments(@Param('token') token: string) {
    const data = await this.service.getSharedDocuments(token);
    return { success: true, data };
  }

  @Get(':token/documents/:docId/download')
  @ApiOperation({ summary: 'Gedeelde bijlage downloaden (publiek)' })
  async downloadSharedDocument(
    @Param('token') token: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    // Verify the planning item exists via token
    const item = await this.prisma.planningItem.findUnique({
      where: { publicToken: token },
      select: { id: true, quoteId: true },
    });
    if (!item) throw new NotFoundException('Afspraak niet gevonden');

    // Collect all entity IDs that this public token authorises access to
    const allowedEntityIds: string[] = [item.id];
    if (item.quoteId) {
      allowedEntityIds.push(item.quoteId);
      const quote = await this.prisma.quote.findUnique({
        where: { id: item.quoteId },
        select: { requestId: true },
      });
      if (quote?.requestId) allowedEntityIds.push(quote.requestId);
    }

    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc || !allowedEntityIds.includes(doc.entityId) || !doc.isSharedWithClient || doc.isDeleted) {
      throw new NotFoundException('Document niet gevonden');
    }

    const buffer = await this.storage.download(doc.storageKey);
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Get(':token/ics')
  @ApiOperation({ summary: '.ics bestand downloaden (publiek)' })
  async downloadIcs(@Param('token') token: string, @Res() res: Response) {
    const item = await this.prisma.planningItem.findUnique({
      where: { publicToken: token },
      include: {
        location: { select: { street: true, houseNumber: true, postalCode: true, city: true } },
        contact: { select: { companyName: true, firstName: true, lastName: true } },
        sessions: {
          where: { isCancelled: false },
          orderBy: { sessionNumber: 'asc' },
          select: {
            id: true,
            sessionNumber: true,
            scheduledDate: true,
            durationHours: true,
            status: true,
            isCancelled: true,
            notes: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Afspraak niet gevonden');

    const ics = this.icalService.generateSingleEvent(item);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="afspraak-${item.id}.ics"`,
    });
    res.send(ics);
  }
}

// ─── iCal feed controller ──────────────────────────────────

@ApiTags('iCal')
@Public()
@Controller('ical')
export class PlanningIcalController {
  constructor(private readonly icalService: PlanningIcalService) {}

  @Get(':ical_token.ics')
  @ApiOperation({ summary: 'Persoonlijke iCal feed voor inspecteur' })
  async getPersonalFeed(@Param('ical_token') icalToken: string, @Res() res: Response) {
    const ics = await this.icalService.generatePersonalFeed(icalToken);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inspexi-planning.ics"',
    });
    res.send(ics);
  }
}
