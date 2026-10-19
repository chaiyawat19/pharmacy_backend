import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalCalendarController } from './personal-calendar.controller';
import { PersonalCalendarService } from './personal-calendar.service';
import { PersonalEvent } from './entities/personal-event.entity';
import { ScheduleMark } from './entities/schedule-mark.entity';
import { Schedule } from '../schedules/entities/schedule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PersonalEvent, ScheduleMark, Schedule])],
  controllers: [PersonalCalendarController],
  providers: [PersonalCalendarService],
})
export class PersonalCalendarModule {}
