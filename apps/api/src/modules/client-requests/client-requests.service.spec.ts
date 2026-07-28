import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ClientRequestsService } from './client-requests.service';
import { ClientRequestEmailService } from './client-request-email.service';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';
import { PrismaService } from '@/prisma';

// WP-B9 mitigatie B-403: een nieuw klantverzoek mag niet stilletjes verdwijnen —
// de organisatie krijgt een directe e-mail (stafwachtrij = Epic 2).
describe('ClientRequestsService (B-403: e-mail naar de organisatie)', () => {
  let service: ClientRequestsService;

  const mockPrisma = {
    clientRequest: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    inspectionPlan: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    organization: { findUnique: jest.fn() },
  };
  const mockInspections = {
    requireOrg: jest.fn((orgId: string | null) => orgId as string),
    assertInspectionAccess: jest.fn(),
    accessibleContactIds: jest.fn(),
  };
  const mockEmail = { sendNewRequestNotice: jest.fn() };

  const user = {
    id: 'cu-1',
    email: 'klant@test.nl',
    firstName: 'Klaas',
    lastName: 'Klant',
    status: 'ACTIVE',
    function: null,
    phone: null,
  } as const;

  const createdRequest = {
    id: 'req-1',
    orgId: 'org-A',
    contactId: 'contact-A',
    clientUserId: 'cu-1',
    requestTypeCode: 'NEW_ASSIGNMENT',
    relatedInspectionPlanId: null,
    subject: 'Nieuwe vestiging keuren',
    description: 'Graag een NEN 1010-inspectie',
    preferredDate: null,
    statusCode: 'PENDING_REQUEST',
    contact: { id: 'contact-A', companyName: 'Opdrachtgever BV', firstName: null, lastName: null },
    relatedInspectionPlan: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClientRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClientInspectionsService, useValue: mockInspections },
        { provide: ClientRequestEmailService, useValue: mockEmail },
      ],
    }).compile();
    service = moduleRef.get(ClientRequestsService);
  });

  describe('notifyOrganization', () => {
    it('mailt actieve ORG_ADMIN/MANAGER/BACKOFFICE-gebruikers van de org (dedup)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { email: 'admin@org.nl' },
        { email: 'backoffice@org.nl' },
        { email: 'admin@org.nl' }, // dubbel → gededupliceerd
      ]);
      mockPrisma.organization.findUnique.mockResolvedValue({ name: 'E2E Org' });

      await service.notifyOrganization(user, createdRequest as never);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 'org-A',
            isActive: true,
            isDeleted: false,
            roles: { hasSome: [Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE] },
          },
        }),
      );
      expect(mockEmail.sendNewRequestNotice).toHaveBeenCalledTimes(1);
      expect(mockEmail.sendNewRequestNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['admin@org.nl', 'backoffice@org.nl'],
          orgName: 'E2E Org',
          requestTypeLabel: 'Nieuwe opdracht',
          subject: 'Nieuwe vestiging keuren',
          contactName: 'Opdrachtgever BV',
          clientUserName: 'Klaas Klant',
        }),
      );
    });

    it('slaat de mail over (met warn) wanneer er geen ontvangers zijn', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.organization.findUnique.mockResolvedValue({ name: 'E2E Org' });

      await service.notifyOrganization(user, createdRequest as never);
      expect(mockEmail.sendNewRequestNotice).not.toHaveBeenCalled();
    });

    it('gooit nooit — een falende mail mag de klant-flow niet breken', async () => {
      mockPrisma.user.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.notifyOrganization(user, createdRequest as never)).resolves.toBeUndefined();
    });
  });

  describe('create-flows dispatchen de notificatie (fire-and-forget)', () => {
    it('createNewAssignment → verzoek aangemaakt + notifyOrganization aangeroepen', async () => {
      mockInspections.accessibleContactIds.mockResolvedValue(['contact-A']);
      mockPrisma.clientRequest.create.mockResolvedValue(createdRequest);
      const notifySpy = jest
        .spyOn(service, 'notifyOrganization')
        .mockResolvedValue(undefined);

      const res = await service.createNewAssignment(user, 'org-A', {
        contactId: 'contact-A',
        subject: 'Nieuwe vestiging keuren',
        description: 'Graag een NEN 1010-inspectie',
      } as never);

      expect(res).toBe(createdRequest);
      expect(notifySpy).toHaveBeenCalledWith(user, createdRequest);
    });

    it('createReinspection → verzoek aangemaakt + notifyOrganization aangeroepen', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        contactId: 'contact-A',
        projectName: 'Project X',
      });
      const reinspection = {
        ...createdRequest,
        requestTypeCode: 'REINSPECTION',
        relatedInspectionPlanId: 'plan-1',
      };
      mockPrisma.clientRequest.create.mockResolvedValue(reinspection);
      const notifySpy = jest
        .spyOn(service, 'notifyOrganization')
        .mockResolvedValue(undefined);

      const res = await service.createReinspection(user, 'org-A', {
        inspectionPlanId: 'plan-1',
        description: 'Graag opnieuw inspecteren',
      } as never);

      expect(res).toBe(reinspection);
      expect(notifySpy).toHaveBeenCalledWith(user, reinspection);
    });
  });
});
