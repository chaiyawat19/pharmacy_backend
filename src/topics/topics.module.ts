import { Module } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { TopicsController } from './topics.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Topic } from './entities/topic.entity';
import { SubTopic } from './entities/sub-topics.entity';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Topic, SubTopic, ItemSubTopic]),
    CommonModule,
  ],
  controllers: [TopicsController],
  providers: [TopicsService],
})
export class TopicsModule { }
