import { IsObject } from 'class-validator';

/** รูปแบบคำตอบละเอียดถูกตรวจใน SurveyService.validateAnswers เทียบกับ survey.definition.ts */
export class SubmitSurveyDto {
  @IsObject()
  answers: Record<string, unknown>;
}
