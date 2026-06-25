import { Module } from '@nestjs/common';
import { InspectorCertificatesController } from './inspector-certificates.controller';
import { InspectorCertificatesService } from './inspector-certificates.service';

@Module({
  controllers: [InspectorCertificatesController],
  providers: [InspectorCertificatesService],
  exports: [InspectorCertificatesService],
})
export class InspectorCertificatesModule {}
