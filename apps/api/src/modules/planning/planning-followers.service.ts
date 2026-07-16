import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertSameOrg } from '@/common';
import { PlanningService } from './planning.service';
import { AddFollowerDto } from './dto';

@Injectable()
export class PlanningFollowersService {
  constructor(
    private prisma: PrismaService,
    private planning: PlanningService,
  ) {}

  // ─── Followers ─────────────────────────────────────────────

  async getFollowers(id: string, user: User) {
    await this.planning.findOne(id, user);
    return this.prisma.planningFollower.findMany({
      where: { planningItemId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addFollower(id: string, dto: AddFollowerDto, user: User) {
    await this.planning.findOne(id, user);
    if (!dto.userId && !dto.email) {
      throw new BadRequestException('Geef een gebruiker ID of een e-mailadres op');
    }

    if (dto.userId) {
      // Prevent enrolling a foreign-org user (whose email would leak back via the
      // `user` include and who would then receive this org's notifications).
      await assertSameOrg(this.prisma.user, dto.userId, user.orgId, 'Gebruiker');
      const exists = await this.prisma.planningFollower.findFirst({
        where: { planningItemId: id, userId: dto.userId },
      });
      if (exists) throw new BadRequestException('Deze gebruiker is al een volger');
    } else {
      const exists = await this.prisma.planningFollower.findFirst({
        where: { planningItemId: id, email: dto.email },
      });
      if (exists) throw new BadRequestException('Dit e-mailadres is al een volger');
    }

    return this.prisma.planningFollower.create({
      data: {
        planningItemId: id,
        userId: dto.userId ?? null,
        email: dto.userId ? null : (dto.email ?? null),
        name: dto.name ?? null,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async removeFollower(id: string, followerId: string, user: User) {
    await this.planning.findOne(id, user);
    const follower = await this.prisma.planningFollower.findUnique({ where: { id: followerId } });
    if (!follower || follower.planningItemId !== id) {
      throw new NotFoundException('Volger niet gevonden');
    }
    await this.prisma.planningFollower.delete({ where: { id: followerId } });
  }
}
