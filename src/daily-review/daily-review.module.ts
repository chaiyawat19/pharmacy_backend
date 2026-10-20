import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyReviewController } from './daily-review.controller';
import { DailyReviewService } from './daily-review.service';
import { DailyReview } from './entities/daily-review.entity';
import { Item } from '../items-bank/entities/items.entity';
import { ItemsBankModule } from '../items-bank/items-bank.module';

@Module({
  imports: [TypeOrmModule.forFeature([DailyReview, Item]), ItemsBankModule],
  controllers: [DailyReviewController],
  providers: [DailyReviewService],
})
export class DailyReviewModule {}
