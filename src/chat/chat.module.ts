import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chat_session } from './entities/chat_session.entity';
import { Chat_message } from './entities/chat_message.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Chat_session, Chat_message])
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule { }
