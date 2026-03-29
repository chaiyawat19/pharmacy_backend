import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserDashboardController } from './user-dashboard.controller';
import { UserDashboardService } from './user-dashboard.service';

import { User } from '../users/entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { ExamResponse } from '../items-bank/entities/exam-response.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, ExamSession, ExamResponse])],
  controllers: [UserDashboardController],
  providers: [UserDashboardService],
})
export class UserDashboardModule {}
