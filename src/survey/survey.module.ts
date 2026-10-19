import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';
import { SurveyResponse } from './entities/survey-response.entity';
import { SurveyParticipant } from './entities/survey-participant.entity';
import { SurveySettings } from './entities/survey-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SurveyResponse,
      SurveyParticipant,
      SurveySettings,
    ]),
  ],
  controllers: [SurveyController],
  providers: [SurveyService],
})
export class SurveyModule {}
