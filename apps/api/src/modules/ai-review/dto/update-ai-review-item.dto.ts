import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AiReviewItemStatus } from '@prisma/client';

export class UpdateAiReviewItemDto {
  @ApiProperty({
    enum: AiReviewItemStatus,
    description: 'Nieuwe status: afvinken (CHECKED), afwijzen (DISMISSED) of heropenen (OPEN)',
  })
  @IsEnum(AiReviewItemStatus, { message: 'Ongeldige status' })
  status: AiReviewItemStatus;
}
