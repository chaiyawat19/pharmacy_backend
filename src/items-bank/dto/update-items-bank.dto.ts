import { PartialType } from '@nestjs/mapped-types';
import { CreateItemsBankDto } from './create-items-bank.dto';

export class UpdateItemsBankDto extends PartialType(CreateItemsBankDto) {}
