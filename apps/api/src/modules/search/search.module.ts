import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma';
import { FavoritesModule } from '../favorites/favorites.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [PrismaModule, FavoritesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
