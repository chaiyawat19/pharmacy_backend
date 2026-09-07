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
        const [
            totalUsers,
            totalSessions,
            totalBanks,
            totalAllBanks,
            avgScoreRaw,
            monthlyScores,
        ] = await Promise.all([
            this.userRepo.count(),
            this.sessionRepo.count(),
            this.bankRepo.count({ where: { is_active: true } }),
            this.bankRepo.count(),
            // 🟢 คะแนนเฉลี่ยรวม (เฉพาะคนที่เป็น 'user' จริงๆ ไม่นับ admin)
            this.sessionRepo
                .createQueryBuilder('s')
                .innerJoin('s.user', 'u')
                .select('AVG(s.final_score)', 'avg')
                .where('s.end_time IS NOT NULL')
                .andWhere('s.final_score IS NOT NULL')
                .andWhere("u.role_id != :adminRoleId", { adminRoleId: 2 })
                .getRawOne(),
            this.sessionRepo
                .createQueryBuilder('s')
                .innerJoin('s.user', 'u')
                .select("TO_CHAR(s.end_time, 'YYYY-MM')", 'month')
                .addSelect('AVG(s.final_score)', 'avg')
                .where('s.end_time IS NOT NULL')
                .andWhere('s.final_score IS NOT NULL')
                .andWhere("u.role_id != :adminRoleId", { adminRoleId: 2 })
                .andWhere("s.end_time >= NOW() - INTERVAL '12 months'")
                .groupBy("TO_CHAR(s.end_time, 'YYYY-MM')")
                .orderBy("TO_CHAR(s.end_time, 'YYYY-MM')", 'ASC')
                .getRawMany(),
        ]);

        return {
            stats: {
                total_users: totalUsers,
                total_item_banks: totalBanks,
                total_all_item_banks: totalAllBanks,
                total_exam_sessions: totalSessions,
                average_score: avgScoreRaw?.avg ? parseFloat(Number(avgScoreRaw.avg).toFixed(1)) : 0,
            },
            monthly_scores: (monthlyScores || []).map((m: any) => ({
                month: m.month,
                avg: m.avg ? parseFloat(Number(m.avg).toFixed(1)) : 0,
            })),
        };
    }
}