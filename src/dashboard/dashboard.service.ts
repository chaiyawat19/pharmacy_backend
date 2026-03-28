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
        const totalAllBanks = await this.bankRepo.count();
        // 🟢 แก้ไข: คะแนนเฉลี่ยรวม (เฉพาะคนที่เป็น 'user' จริงๆ ไม่นับ admin)
        const avgScoreRaw = await this.sessionRepo
            .createQueryBuilder('s')
            .innerJoin('s.user', 'u')
            .select('AVG(s.final_score)', 'avg')
            .where('s.end_time IS NOT NULL')
            .andWhere('s.final_score IS NOT NULL')
            // ใช้ != 2 เพื่อตัด Admin ออกจากการคำนวณสถิติ
            .andWhere("u.role_id != :adminRoleId", { adminRoleId: 2 })
            .getRawOne();

        const monthlyScores = await this.sessionRepo
            .createQueryBuilder('s')
            .innerJoin('s.user', 'u')
            .select("TO_CHAR(s.end_time, 'YYYY-MM')", 'month')
            .addSelect('AVG(s.final_score)', 'avg')
            .where('s.end_time IS NOT NULL')
            .andWhere('s.final_score IS NOT NULL')
            .andWhere("u.role_id != :adminRoleId", { adminRoleId: 2 }) // ตัด Admin ออกด้วย
            .andWhere("s.end_time >= NOW() - INTERVAL '12 months'")
            .groupBy("TO_CHAR(s.end_time, 'YYYY-MM')")
            .orderBy("TO_CHAR(s.end_time, 'YYYY-MM')", 'ASC')
            .getRawMany();
        return {

            stats: {
                total_users: totalUsers,
                total_item_banks: totalBanks,
                total_all_item_banks: totalAllBanks,
                total_exam_sessions: totalSessions,
                // ปัดเศษ 1 ตำแหน่งเพื่อให้แสดงผลสวยงาม (76.0)
                average_score: avgScoreRaw.avg ? parseFloat(Number(avgScoreRaw.avg).toFixed(1)) : 0,
            },
            monthly_scores: monthlyScores.map(m => ({
                month: m.month,
                avg: m.avg ? parseFloat(Number(m.avg).toFixed(1)) : 0,
            })),
        };
    }
}