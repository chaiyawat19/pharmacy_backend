import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CATController } from './cat.controller';
import { CATExamService } from './cat-exam.service';
import { CATService } from './cat.service';
import { IRTService } from './irt.service';
import { CATSession } from './entities/cat-session.entity';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';
import { Item } from '../items-bank/entities/items.entity';
import { AnswerOption } from '../items-bank/entities/answer_options.entity';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { Topic } from '../topics/entities/topic.entity';

import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            CATSession,
            ItemsBank,
            ItemBankItem,
            Item,
            AnswerOption,
            ItemSubTopic,
            Topic,
        ]),
        NotificationsModule,
    ],
    controllers: [CATController],
    providers: [CATExamService, CATService, IRTService],
    exports: [CATExamService, CATService, IRTService],
})
export class CATModule { }
