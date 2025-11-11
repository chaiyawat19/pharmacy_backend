import {
    IsEmail,
    IsNotEmpty,
    IsString,
    MinLength,
    IsDate,
    IsInt
} from 'class-validator';
import { Type } from 'class-transformer';
import { Match } from '../../common/decorators/match.decorator';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  first_name: string;

  @IsNotEmpty()
  @IsString()
  last_name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  tel: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @Match('password', { message: 'Passwords do not match' })
  confirm_password: string;

  @IsNotEmpty()
  @Type(() => Date)
  bod: Date;

  @IsNotEmpty()
  @IsInt()
  university_id: number;
}
