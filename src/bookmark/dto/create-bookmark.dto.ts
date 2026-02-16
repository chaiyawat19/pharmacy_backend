import { IsNumber, IsNotEmpty } from 'class-validator';

export class CreateBookmarkDto {
  @IsNumber()
  @IsNotEmpty()
  articleId: number;
}
