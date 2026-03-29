import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { DashboardService } from './dashboard.service'
import { DashboardController } from './dashboard.controller'

import { User } from '../users/entities/user.entity'
import { ItemsBank } from '../items-bank/entities/items-bank.entity'
import { ExamSession } from '../items-bank/entities/exam-session.entity'

@Module({
  imports: [TypeOrmModule.forFeature([User, ItemsBank, ExamSession])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}