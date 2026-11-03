import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemReportsController } from './item-reports.controller';
import { ItemReportsService } from './item-reports.service';
import { ItemReport } from './entities/item-report.entity';
import { Item } from '../items-bank/entities/items.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ItemReport, Item, ItemBankItem])],
  controllers: [ItemReportsController],
  providers: [ItemReportsService],
})
export class ItemReportsModule {}
