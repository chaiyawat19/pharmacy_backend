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
    // 1. Subquery: ดึงคะแนนครั้งที่ดีที่สุด (MAX) และจำนวนครั้งที่สอบของแต่ละ user_id
    const userBestSubquery = this.examSessionRepository
      .createQueryBuilder('es')
      .innerJoin('es.user', 'usr')
      .select('usr.user_id', 'user_id')
      .addSelect('usr.university_id', 'university_id')
      .addSelect('MAX(es.final_score)', 'best_score')
      .addSelect('COUNT(es.session_id)', 'user_exams')
      .where('(es.session_type = :type OR es.session_type = :lowerType OR es.session_type IS NULL)', {
        type: 'NORMAL',
        lowerType: 'normal',
      })
      .andWhere('es.end_time IS NOT NULL')
      .andWhere('es.final_score IS NOT NULL')
      .andWhere('(usr.role_id != :adminRoleId OR usr.role_id IS NULL)', { adminRoleId: 2 })
      .andWhere('usr.university_id IS NOT NULL')
      .groupBy('usr.user_id')
      .addGroupBy('usr.university_id');

    // 2. Main Query: รวมคะแนนเฉลี่ยระดับมหาวิทยาลัยจาก Best Score ของนักศึกษาแต่ละคน
    const rows: Array<{
      university_id: string;
      university_name: string;
      avg_score: string;
      top_score: string;
      total_students: string;
      total_exams: string;
    }> = await this.examSessionRepository.manager
      .createQueryBuilder()
      .select('univ.university_id', 'university_id')
      .addSelect('univ.name', 'university_name')
      .addSelect('AVG(ub.best_score)', 'avg_score')
      .addSelect('MAX(ub.best_score)', 'top_score')
      .addSelect('COUNT(ub.user_id)', 'total_students')
      .addSelect('SUM(ub.user_exams)', 'total_exams')
      .from(`(${userBestSubquery.getQuery()})`, 'ub')
      .setParameters(userBestSubquery.getParameters())
      .innerJoin('universities', 'univ', 'univ.university_id = ub.university_id')
      .groupBy('univ.university_id')
      .addGroupBy('univ.name')
      .orderBy('AVG(ub.best_score)', 'DESC')
      .limit(limit)
      .getRawMany();

    return rows.map((row, index) => ({
      rank: index + 1,
      university_id: Number(row.university_id),
      university_name: row.university_name,
      avg_score: row.avg_score ? parseFloat(Number(row.avg_score).toFixed(1)) : 0,
      top_score: row.top_score ? parseFloat(Number(row.top_score).toFixed(1)) : 0,
      total_students: Number(row.total_students) || 0,
      total_exams: Number(row.total_exams) || 0,
    }));
  }
}

