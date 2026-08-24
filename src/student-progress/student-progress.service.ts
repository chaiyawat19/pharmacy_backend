import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CATSession } from '../cat/entities/cat-session.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { User } from '../users/entities/user.entity';

type StudentListQuery = {
  page: number;
  limit: number;
  search: string;
};

type StudentListItem = {
  id: number;
  name: string;
  email: string;
};

type ThetaStatus = 'ระดับสูง' | 'ปานกลาง' | 'ต้องปรับปรุง';

type ExamResponse = {
  is_correct?: boolean;
};

@Injectable()
export class StudentProgressService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ExamSession)
    private readonly examSessionRepo: Repository<ExamSession>,
    @InjectRepository(CATSession)
    private readonly catSessionRepo: Repository<CATSession>,
  ) {}

  async getStudents(query: StudentListQuery) {
    const page =
      Number.isFinite(query.page) && query.page > 0
        ? Math.floor(query.page)
        : 1;
    const limit =
      Number.isFinite(query.limit) && query.limit > 0
        ? Math.min(Math.floor(query.limit), 50)
        : 10;
    const search = query.search?.trim() ?? '';

    const builder = this.userRepo
      .createQueryBuilder('user')
      .where('user.role_id = :roleId', { roleId: 1 });

    if (search) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where(
            "CONCAT(user.first_name, ' ', user.last_name) ILIKE :search",
            {
              search: `%${search}%`,
            },
          )
            .orWhere('user.email ILIKE :search', { search: `%${search}%` })
            .orWhere('user.first_name ILIKE :search', { search: `%${search}%` })
            .orWhere('user.last_name ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    const [students, totalItems] = await builder
      .orderBy('user.user_id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data: StudentListItem[] = students.map((student) => ({
      id: student.user_id,
      name: `${student.first_name} ${student.last_name}`.trim(),
      email: student.email,
    }));

    return {
      data,
      meta: {
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
        currentPage: page,
      },
    };
  }

  async getStudentProgress(studentId: number) {
    const student = await this.userRepo.findOne({
      where: { user_id: studentId, role_id: 1 },
    });

    if (!student) {
      throw new NotFoundException('ไม่พบนักเรียนที่ต้องการ');
    }

    const [normalSessions, catSessions] = await Promise.all([
      this.examSessionRepo.find({
        where: {
          userId: studentId,
          session_type: 'NORMAL',
        },
        relations: ['item_bank'],
        order: {
          start_time: 'DESC',
        },
      }),
      this.catSessionRepo.find({
        where: {
          userId: studentId,
        },
        relations: ['base_session', 'base_session.item_bank'],
        order: {
          start_time: 'ASC',
        },
      }),
    ]);

    // รวมข้อมูลทั้ง CAT และ Classical เป็นแนวโน้มเดียว
    const allExamHistory = [
      ...normalSessions.map((session) => ({
        date: session.end_time ?? session.start_time,
        type: 'Classical',
        theta: this.scoreToTheta(session.final_score ?? 0),
        score: session.final_score ?? 0,
        name: session.item_bank?.bank_name ?? `Exam #${session.session_id}`,
      })),
      ...catSessions.map((session) => ({
        date: session.end_time ?? session.start_time,
        type: 'CAT',
        theta: this.getCatTheta(session),
        name:
          session.base_session?.item_bank?.bank_name ??
          `CAT #${session.session_id}`,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    const chart = allExamHistory.map((exam, index) => ({
      attempt: `ครั้งที่ ${index + 1}`,
      date: this.formatThaiDate(exam.date),
      theta: this.roundTheta(exam.theta),
      score: (exam as any).score ?? null,
      type: exam.type,
      examName: exam.name,
      name: exam.name,
    }));

    const normalExams = normalSessions
      .filter((session) => session.end_time)
      .map((session) => {
        const responses = Array.isArray(session.responses)
          ? (session.responses as unknown as ExamResponse[])
          : [];
        const totalQuestions = responses.length;
        const correctCount = responses.filter(
          (response) => response?.is_correct,
        ).length;
        const score = this.roundScore(session.final_score ?? 0);

        return {
          id: Number(session.session_id),
          name:
            session.item_bank?.bank_name ??
            `Classical Exam #${session.session_id}`,
          score,
          total: 100,
          totalQuestions,
          correctCount,
          date: this.formatThaiDate(session.end_time ?? session.start_time),
        };
      });

    const catExams = catSessions
      .slice()
      .sort((a, b) => b.start_time.getTime() - a.start_time.getTime())
      .map((session) => {
        const theta = this.roundTheta(this.getCatTheta(session));
        const responses = Array.isArray(session.responses)
          ? session.responses
          : [];

        return {
          id: Number(session.session_id),
          name:
            session.base_session?.item_bank?.bank_name ??
            `CAT Exam #${session.session_id}`,
          totalQuestions: session.num_items,
          correctCount: session.num_correct,
          theta,
          status: this.getThetaStatus(theta),
          date: this.formatThaiDate(session.end_time ?? session.start_time),
          responses: responses.map((r: any, idx: number) => ({
            questionNumber: r.item_number ?? r.question_number ?? r.questionNumber ?? (idx + 1),
            itemId: r.item_id,
            isCorrect: r.is_correct ?? r.isCorrect ?? false,
            responseTime: r.response_time_ms,
            timeSpent: r.time_spent ?? (r.response_time_ms ? Math.round(r.response_time_ms / 1000) : 0),
            thetaBefore: this.roundTheta(r.theta_before ?? 0),
            thetaAfter: this.roundTheta(r.theta_after ?? r.theta ?? 0),
          })),
        };
      });

    const latestTheta = chart.at(-1)?.theta ?? 0;

    return {
      studentId,
      currentTheta: latestTheta,
      totalExams: normalExams.length + catExams.length,
      chart,
      normalExams,
      catExams,
    };
  }

  /**
   * แปลงคะแนน Classical (0-100) เป็น Theta equivalent
   * โดยประมาณ: 50 = theta 0, 75 = theta 1, 25 = theta -1
   */
  private scoreToTheta(score: number): number {
    // Linear transformation: theta = (score - 50) / 25
    // score 0 → theta -2
    // score 50 → theta 0
    // score 100 → theta 2
    return (score - 50) / 25;
  }

  private getCatTheta(session: CATSession) {
    return session.final_theta ?? session.current_theta ?? 0;
  }

  private getThetaStatus(theta: number): ThetaStatus {
    if (theta > 1.0) {
      return 'ระดับสูง';
    }

    if (theta < -1.0) {
      return 'ต้องปรับปรุง';
    }

    return 'ปานกลาง';
  }

  private roundTheta(theta: number) {
    return Number(theta.toFixed(2));
  }

  private roundScore(score: number) {
    return Number(score.toFixed(2));
  }

  private formatThaiDate(date: Date | null) {
    if (!date) {
      return '-';
    }

    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
}
