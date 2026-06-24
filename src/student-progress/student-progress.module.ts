import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CATSession } from '../cat/entities/cat-session.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { User } from '../users/entities/user.entity';
import { StudentProgressController } from './student-progress.controller';
import { StudentProgressService } from './student-progress.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ExamSession, CATSession])],
  controllers: [StudentProgressController],
  providers: [StudentProgressService],
})
export class StudentProgressModule {}
