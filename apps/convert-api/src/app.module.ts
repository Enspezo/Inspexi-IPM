import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConvertModule } from './convert/convert.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ConvertModule],
})
export class AppModule {}
