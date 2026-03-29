import { Module } from '@nestjs/common';
import { ItemsBankService } from './items-bank.service';
import { ItemsBankController } from './items-bank.controller';
import { ExamController } from './exam.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsBank } from './entities/items-bank.entity';
import { ItemSituation } from './entities/item_situations.entity';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { AnswerOption } from './entities/answer_options.entity';
import { ItemSubTopic } from './entities/item_sub_topics.entity';
import { ItemBankCategory } from './entities/item_bank_category.entity';
import { ExamSession } from './entities/exam-session.entity';
import { UserItemMastery } from './entities/user_item_mastery.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { CATSession } from '../cat/entities/cat-session.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemsBank,
      ItemSituation,
      Item,
      ItemBankItem,
      AnswerOption,
      ItemSubTopic,
      ItemBankCategory,
      ExamSession,
      UserItemMastery,
      CATSession,
      User,
      Notification,
    ]),
    NotificationsModule,
  ],
  controllers: [ItemsBankController, ExamController],
  providers: [ItemsBankService],
})
export class ItemsBankModule { }
