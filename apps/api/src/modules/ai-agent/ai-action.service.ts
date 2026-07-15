import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiActionStatus, AiPendingAction, User } from '@prisma/client';
import { assertFound } from '@/common';
import { requestContext } from '@/common/services/request-context';
import { PrismaService } from '@/prisma/prisma.service';
import { AiToolRegistry } from './tools/tool-registry';

/**
 * Bevestigen/afwijzen van door de agent voorgestelde schrijfacties (PRD-12
 * §5.3–5.4). Een bevestigde write draait binnen een `source='AI'`-auditcontext,
 * op naam van de ingelogde gebruiker, via exact dezelfde service-methode als een
 * normale UI-actie — dus de bestaande guards/scoping en de audit-middleware
 * gelden, en de mutatie krijgt automatisch `source=AI` in de audittrail.
 */
@Injectable()
export class AiActionService {
  private readonly logger = new Logger(AiActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiToolRegistry,
  ) {}

  /** Actie van de gebruiker ophalen (org+user-gescoped → 404 bij cross-tenant). */
  async getOwnedAction(id: string, user: User): Promise<AiPendingAction> {
    const action = await this.prisma.aiPendingAction.findFirst({
      where: { id, orgId: user.orgId ?? undefined, userId: user.id },
    });
    return assertFound(action, 'Actie');
  }

  /** Bevestig en voer de schrijfactie uit (optioneel met bijgewerkte argumenten). */
  async confirm(
    id: string,
    user: User,
    ipAddress: string | undefined,
    editedArgs?: Record<string, any>,
  ): Promise<AiPendingAction> {
    const action = await this.getOwnedAction(id, user);
    this.assertPending(action);

    const def = this.registry.get(action.toolName);
    if (!def || !def.mutates) {
      throw new BadRequestException(`Onbekende schrijf-actie: ${action.toolName}`);
    }

    const args = editedArgs ?? (action.args as Record<string, any>);

    try {
      // Nested AsyncLocalStorage-context: de mutatie ziet source='AI', terwijl de
      // omliggende HTTP-request (interceptor) source='HUMAN' had.
      const output = await requestContext.run(
        {
          userId: user.id,
          orgId: action.orgId,
          ipAddress,
          source: 'AI',
        },
        () => def.run({ user }, args),
      );

      return this.prisma.aiPendingAction.update({
        where: { id: action.id },
        data: {
          status: AiActionStatus.EXECUTED,
          args: args as any,
          result: { output: output ?? null, isError: false } as any,
          confirmedById: user.id,
          confirmedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI action ${action.toolName} failed: ${message}`);
      return this.prisma.aiPendingAction.update({
        where: { id: action.id },
        data: {
          status: AiActionStatus.FAILED,
          args: args as any,
          result: { output: message, isError: true } as any,
          confirmedById: user.id,
          confirmedAt: new Date(),
        },
      });
    }
  }

  /** Wijs de schrijfactie af (de agent krijgt dit als tool_result terug). */
  async reject(id: string, user: User): Promise<AiPendingAction> {
    const action = await this.getOwnedAction(id, user);
    this.assertPending(action);

    return this.prisma.aiPendingAction.update({
      where: { id: action.id },
      data: {
        status: AiActionStatus.REJECTED,
        result: {
          output: 'De gebruiker heeft deze actie afgewezen.',
          isError: false,
        } as any,
        confirmedById: user.id,
        confirmedAt: new Date(),
      },
    });
  }

  private assertPending(action: AiPendingAction): void {
    if (action.status !== AiActionStatus.PENDING) {
      throw new BadRequestException('Deze actie is al afgehandeld');
    }
  }
}
