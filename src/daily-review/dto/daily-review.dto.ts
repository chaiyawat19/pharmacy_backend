import { IsInt, Min } from 'class-validator';

export class AnswerDailyReviewDto {
  @IsInt()
  @Min(1)
  item_id: number;

  @IsInt()
  @Min(1)
  option_id: number;
}
