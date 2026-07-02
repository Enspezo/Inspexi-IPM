import { Global, Module } from '@nestjs/common';
import { EnumerationGuardService } from './enumeration-guard.service';

@Global()
@Module({
  providers: [EnumerationGuardService],
  exports: [EnumerationGuardService],
})
export class EnumerationGuardModule {}
