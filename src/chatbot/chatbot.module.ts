import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ChatbotDocumentsController } from './chatbot-documents.controller';
import { ChatbotDocumentsService } from './chatbot-documents.service';
import { ChatbotDocument } from '../chat/entities/chatbot_document.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([ChatbotDocument]),
  ],
  controllers: [ChatbotDocumentsController],
  providers: [ChatbotDocumentsService],
})
export class ChatbotModule {}
