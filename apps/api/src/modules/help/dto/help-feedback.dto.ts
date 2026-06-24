import { IsBoolean } from 'class-validator';

export class HelpFeedbackDto {
  @IsBoolean() helpful!: boolean;
}
