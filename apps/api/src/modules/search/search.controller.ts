import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Globale zoekopdracht over alle entiteitstypen' })
  async search(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.searchService.search(user, query);
    return { success: true, data: result };
  }
}
