import { Module } from '@nestjs/common';
import { UniversitiesService } from './universities.service';
import { UniversitiesController } from './universities.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { University } from './entities/university.entity';
import { User } from '../users/entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([University, User, ExamSession])],
  controllers: [UniversitiesController],
  providers: [UniversitiesService],
})
export class UniversitiesModule {}

