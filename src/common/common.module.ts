import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NameUniquenessService } from './name-uniqueness.service';
import { Topic } from '../topics/entities/topic.entity';
import { SubTopic } from '../topics/entities/sub-topics.entity';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { NewsArticle } from '../news/entities/news.entity';
import { Schedule } from '../schedules/entities/schedule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Topic,
      SubTopic,
      ItemsBank,
      NewsArticle,
      Schedule,
    ]),
  ],
  providers: [NameUniquenessService],
  exports: [NameUniquenessService],
})
export class CommonModule {}
