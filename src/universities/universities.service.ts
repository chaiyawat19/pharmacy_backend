import { Injectable } from '@nestjs/common';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { University } from './entities/university.entity';
import { User } from '../users/entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';

@Injectable()
export class UniversitiesService {
  constructor(
    @InjectRepository(University)
    private readonly universityRepository: Repository<University>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ExamSession)
    private readonly examSessionRepository: Repository<ExamSession>,
  ) {}

  create(createUniversityDto: CreateUniversityDto) {
    return 'This action adds a new university';
  }

  findAll() {
    const universities = this.universityRepository.find();
    console.log(universities);
    return universities;
    return `This action returns all universities`;
  }

  findOne(id: number) {
    return `This action returns a #${id} university`;
  }

  update(id: number, updateUniversityDto: UpdateUniversityDto) {
    return `This action updates a #${id} university`;
  }

  remove(id: number) {
    return `This action removes a #${id} university`;
  }

  async getLeaderboard(limit = 10) {
    const rows: Array<{
      university_id: string;
      university_name: string;
      avg_score: string;
      top_score: string;
      total_students: string;
      total_exams: string;
    }> = await this.examSessionRepository
      .createQueryBuilder('es')
      .innerJoin('es.user', 'usr')
      .innerJoin('usr.university', 'univ')
      .select('univ.university_id', 'university_id')
      .addSelect('univ.name', 'university_name')
      .addSelect('AVG(es.final_score)', 'avg_score')
      .addSelect('MAX(es.final_score)', 'top_score')
      .addSelect('COUNT(DISTINCT usr.user_id)', 'total_students')
      .addSelect('COUNT(es.session_id)', 'total_exams')
      .where('es.session_type = :type', { type: 'NORMAL' })
      .andWhere('es.end_time IS NOT NULL')
      .andWhere('es.final_score IS NOT NULL')
      .andWhere('usr.role_id = :roleId', { roleId: 1 })
      .andWhere('usr.university_id IS NOT NULL')
      .groupBy('univ.university_id')
      .addGroupBy('univ.name')
      .having('COUNT(DISTINCT usr.user_id) >= :minStudents', { minStudents: 1 })
      .orderBy('avg_score', 'DESC')
      .limit(limit)
      .getRawMany();

    return rows.map((row, index) => ({
      rank: index + 1,
      university_id: Number(row.university_id),
      university_name: row.university_name,
      avg_score: row.avg_score ? parseFloat(Number(row.avg_score).toFixed(1)) : 0,
      top_score: row.top_score ? parseFloat(Number(row.top_score).toFixed(1)) : 0,
      total_students: Number(row.total_students),
      total_exams: Number(row.total_exams),
    }));
  }
}

