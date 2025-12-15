import { Module } from '@nestjs/common';
import { ItemsBankService } from './items-bank.service';
import { ItemsBankController } from './items-bank.controller';

@Module({
  controllers: [ItemsBankController],
  providers: [ItemsBankService],
})
export class ItemsBankModule {}
