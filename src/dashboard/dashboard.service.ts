import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';

@Injectable()
export class DashboardService {

    constructor(
        @InjectRepository(User)
        private userRepo: Repository<User>,

        @InjectRepository(ItemsBank)
        private bankRepo: Repository<ItemsBank>,

        @InjectRepository(ExamSession)
        private sessionRepo: Repository<ExamSession>,
    ) { }

    async getAdminDashboard() {
        const totalUsers = await this.userRepo.count();
        const totalSessions = await this.sessionRepo.count();
        const totalBanks = await this.bankRepo.count({ where: { is_active: true } });
        const totalAllBanks = await this.bankRepo.count(); // ทั้งหมด

        // คะแนนเฉลี่ยรวม
        const avgScoreRaw = await this.sessionRepo
            .createQueryBuilder('s')
            .select('AVG(s.final_score)', 'avg')
            .where('s.end_time IS NOT NULL')
            .getRawOne();

        // คะแนนเฉลี่ยรายเดือน (12 เดือนล่าสุด)
        const monthlyScores = await this.sessionRepo
            .createQueryBuilder('s')
            .select("TO_CHAR(s.end_time, 'YYYY-MM')", 'month')
            .addSelect('AVG(s.final_score)', 'avg')
            .where('s.end_time IS NOT NULL')
            .andWhere("s.end_time >= NOW() - INTERVAL '12 months'")
            .groupBy("TO_CHAR(s.end_time, 'YYYY-MM')")
            .orderBy("TO_CHAR(s.end_time, 'YYYY-MM')", 'ASC')
            .getRawMany();

        return {
            stats: {
                total_users: totalUsers,
                total_item_banks: totalBanks,
                total_all_item_banks: totalAllBanks, // เพิ่มตรงนี้
                total_exam_sessions: totalSessions,
                average_score: Number(avgScoreRaw.avg) || 0,
            },
            monthly_scores: monthlyScores.map(m => ({
                month: m.month,
                avg: Number(m.avg) || 0,
            })),
        };
    }
}