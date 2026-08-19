import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MSTController } from './mst.controller';
import { MSTService } from './mst.service';
import { MSTRoutingService } from './mst-routing.service';
import { MSTSession } from './entities/mst-session.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';
import { Item } from '../items-bank/entities/items.entity';
import { AnswerOption } from '../items-bank/entities/answer_options.entity';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { Topic } from '../topics/entities/topic.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { IRTService } from '../cat/irt.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ExamSession,
            MSTSession,
            ItemsBank,
            ItemBankItem,
            Item,
            AnswerOption,
            ItemSubTopic,
            Topic,
        ]),
        NotificationsModule,
    ],
    controllers: [MSTController],
    providers: [MSTService, MSTRoutingService, IRTService],
    exports: [MSTService, MSTRoutingService],
})
export class MSTModule { }
