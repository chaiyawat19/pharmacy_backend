import { Module } from '@nestjs/common';
import { ItemsBankService } from './items-bank.service';
import { ItemsBankController } from './items-bank.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsBank } from './entities/items-bank.entity';
import { ItemSituation } from './entities/item_situations.entity';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { AnswerOption } from './entities/answer_options.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ItemsBank, ItemSituation, Item, ItemBankItem, AnswerOption])],
  controllers: [ItemsBankController],
  providers: [ItemsBankService],
})
export class ItemsBankModule { }
