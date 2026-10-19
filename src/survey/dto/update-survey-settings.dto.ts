import { IsBoolean } from 'class-validator';

export class UpdateSurveySettingsDto {
  @IsBoolean()
  isOpen: boolean;
}
