import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { UserDashboardDto } from './dto/user-dashboard.dto';

const EXAM_DATE = new Date('2026-06-01'); // วันสอบจริง — ปรับได้
const PASS_THRESHOLD = 60; // เกณฑ์ผ่าน — ปรับได้

@Injectable()
export class UserDashboardService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(ExamSession)
    private sessionRepo: Repository<ExamSession>,

  ) {}

  async getUserDashboard(userId: number): Promise<UserDashboardDto> {
    const [stats, ranking, radarData, weakTopics] = await Promise.all([
      this.getStats(userId),
      this.getRanking(userId),
      this.getRadarData(userId),
      this.getWeakTopics(userId),
    ]);

    return { stats, ranking, radar_data: radarData, weak_topics: weakTopics };
  }

  // ── 1. Stats ──────────────────────────────────────────────────────────────

  private async getStats(userId: number) {
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.end_time IS NOT NULL')
      .orderBy('s.end_time', 'DESC')
      .getMany();

    const totalExams = sessions.length;
    const passedExams = sessions.filter(
      (s) => (s.final_score ?? 0) >= PASS_THRESHOLD,
    ).length;
    const failedExams = totalExams - passedExams;

    const averageScore =
      totalExams > 0
        ? sessions.reduce((sum, s) => sum + (s.final_score ?? 0), 0) /
          totalExams
        : 0;

    const lastExamScore = sessions[0]?.final_score ?? 0;

    // improvement: avg 5 ครั้งล่าสุด vs 5 ครั้งก่อนหน้า
    const recentAvg = this.average(
      sessions.slice(0, 5).map((s) => s.final_score ?? 0),
    );
    const prevAvg = this.average(
      sessions.slice(5, 10).map((s) => s.final_score ?? 0),
    );
    const improvementRate =
      prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

    const studyMinutes = sessions.reduce((sum, s) => {
      if (!s.start_time || !s.end_time) return sum;

      const start = new Date(s.start_time).getTime();
      const end = new Date(s.end_time).getTime();
      const diffMs = end - start;
      return sum + (diffMs > 0 ? Math.floor(diffMs / (1000 * 60)) : 0);
    }, 0);

    const daysUntilExam = Math.max(
      0,
      Math.ceil((EXAM_DATE.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );

    return {
      total_exams: totalExams,
      passed_exams: passedExams,
      failed_exams: failedExams,
      average_score: Math.round(averageScore * 10) / 10,
      last_exam_score: lastExamScore,
      improvement_rate: Math.round(improvementRate * 10) / 10,
      days_until_exam: daysUntilExam,
      study_minutes: studyMinutes,
    };
  }

  // ── 2. Ranking ────────────────────────────────────────────────────────────

  private async getRanking(userId: number) {
    const rankRaw = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'uid')
      .addSelect('AVG(s.final_score)', 'avg')
      .where('s.end_time IS NOT NULL')
      .andWhere('s.final_score IS NOT NULL')
      .groupBy('s.user_id')
      .getRawMany();

    const sorted = rankRaw
      .map((r) => ({ uid: Number(r.uid), avg: Number(r.avg) || 0 }))
      .sort((a, b) => b.avg - a.avg);

    const totalUsers = sorted.length;
    const idx = sorted.findIndex((r) => r.uid === userId);
    const currentRank = idx >= 0 ? idx + 1 : totalUsers + 1;
    const percentile =
      totalUsers > 0 ? ((totalUsers - currentRank) / totalUsers) * 100 : 0;

    const userScore = sorted.find((r) => r.uid === userId)?.avg ?? 0;
    const topScore = sorted[0]?.avg ?? 0;
    const globalAvg =
      sorted.length > 0
        ? sorted.reduce((s, r) => s + r.avg, 0) / sorted.length
        : 0;

    const rankChange = await this.getRankChange(userId, sorted);

    return {
      current_rank: currentRank,
      total_users: totalUsers,
      percentile: Math.round(percentile * 10) / 10,
      rank_change: rankChange,
      score_range: {
        top: Math.round(topScore),
        user_score: Math.round(userScore),
        average: Math.round(globalAvg),
      },
    };
  }

  private async getRankChange(
    userId: number,
    currentSorted: { uid: number; avg: number }[],
  ) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const oldRaw = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'uid')
      .addSelect('AVG(s.final_score)', 'avg')
      .where('s.end_time IS NOT NULL')
      .andWhere('s.end_time < :cutoff', { cutoff: sevenDaysAgo })
      .andWhere('s.final_score IS NOT NULL')
      .groupBy('s.user_id')
      .getRawMany();

    const oldSorted = oldRaw
      .map((r) => ({ uid: Number(r.uid), avg: Number(r.avg) || 0 }))
      .sort((a, b) => b.avg - a.avg);

    const oldIdx = oldSorted.findIndex((r) => r.uid === userId);
    const newIdx = currentSorted.findIndex((r) => r.uid === userId);

    const oldRank = oldIdx >= 0 ? oldIdx + 1 : 0;
    const newRank = newIdx >= 0 ? newIdx + 1 : 0;

    return oldRank > 0 && newRank > 0 ? oldRank - newRank : 0;
  }

  // ── 3. Radar chart — % ถูกต้องแยกตาม Topic (หมวดใหญ่) ──────────────────
  //
  // ดึง item_id + is_correct จาก JSONB responses ใน ExamSession
  // แล้ว join ผ่าน item_sub_topics → sub_topics → topics
  //
  private async getRadarData(userId: number) {
    const raw: { topic_id: number; subject: string; total: string; correct: string }[] =
      await this.sessionRepo.manager.query(
        `
        WITH resp AS (
          SELECT
            (r->>'item_id')::int   AS item_id,
            (r->>'is_correct')::bool AS is_correct
          FROM exam_sessions s,
               jsonb_array_elements(s.responses) AS r
          WHERE s.user_id      = $1
            AND s.end_time     IS NOT NULL
            AND s.responses    IS NOT NULL
            AND jsonb_array_length(s.responses) > 0
        )
        SELECT
          t.topic_id,
          t.topic_name                                      AS subject,
          COUNT(resp.item_id)::text                         AS total,
          SUM(CASE WHEN resp.is_correct THEN 1 ELSE 0 END)::text AS correct
        FROM resp
        JOIN item_sub_topics ist ON ist.item_id   = resp.item_id
        JOIN sub_topics      st  ON st.sub_topic_id = ist.sub_topic_id
        JOIN topics          t   ON t.topic_id     = st.topic_id
        GROUP BY t.topic_id, t.topic_name
        ORDER BY t.topic_name ASC
        `,
        [userId],
      );

    return raw.map((r) => {
      const total = Number(r.total) || 0;
      const correct = Number(r.correct) || 0;
      const score = total > 0 ? Math.round((correct / total) * 100) : 0;
      return {
        subject: r.subject ?? 'ไม่ระบุ',
        score,
        full_mark: 100,
      };
    });
  }

  // ── 4. Weak topics — % ถูกต้องแยกตาม SubTopic เรียงจากน้อยไปมาก ─────────
  // ดึง item_id + is_correct จาก JSONB responses ของ session
  private async getWeakTopics(userId: number) {
    const raw: {
      subject: string;
      topic: string;
      total: string;
      correct: string;
    }[] = await this.sessionRepo.manager.query(
      `
      WITH resp AS (
        SELECT
          (r->>'item_id')::int    AS item_id,
          (r->>'is_correct')::bool AS is_correct
        FROM exam_sessions s,
             jsonb_array_elements(s.responses) AS r
        WHERE s.user_id   = $1
          AND s.end_time  IS NOT NULL
          AND s.responses IS NOT NULL
          AND jsonb_array_length(s.responses) > 0
      )
      SELECT
        t.topic_name                                        AS subject,
        st.sub_topic_name                                   AS topic,
        COUNT(resp.item_id)::text                           AS total,
        SUM(CASE WHEN resp.is_correct THEN 1 ELSE 0 END)::text AS correct
      FROM resp
      JOIN item_sub_topics ist ON ist.item_id     = resp.item_id
      JOIN sub_topics      st  ON st.sub_topic_id = ist.sub_topic_id
      JOIN topics          t   ON t.topic_id      = st.topic_id
      GROUP BY t.topic_name, st.sub_topic_id, st.sub_topic_name
      HAVING COUNT(resp.item_id) >= 3
      `,
      [userId],
    );

    const mapped = raw.map((r) => {
      const total = Number(r.total) || 0;
      const correct = Number(r.correct) || 0;
      const score = total > 0 ? Math.round((correct / total) * 100) : 0;
      return {
        subject: r.subject ?? 'ไม่ระบุ',
        topic: r.topic ?? 'ไม่ระบุ',
        score,
        priority: this.getPriority(score),
        study_time: this.estimateStudyTime(score),
        resources: Math.max(1, Math.round((100 - score) / 20)),
      };
    });

    return mapped.sort((a, b) => a.score - b.score).slice(0, 10);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getPriority(
    score: number,
  ): UserDashboardDto['weak_topics'][0]['priority'] {
    if (score < 60) return 'ต้องรีบทบทวน!';
    if (score < 70) return 'ควรทบทวนเพิ่มเติม';
    if (score < 80) return 'พอใช้ แต่ควรฝึกฝนเพิ่มเติม';
    return 'ทำได้ดี';
  }

  private estimateStudyTime(score: number): string {
    if (score < 60) return '12 ชม.';
    if (score < 70) return '10 ชม.';
    if (score < 80) return '8 ชม.';
    return '6 ชม.';
  }

  private average(nums: number[]): number {
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
}
