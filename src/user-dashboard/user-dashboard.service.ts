import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { CATSession } from '../cat/entities/cat-session.entity';
import { UserDashboardDto } from './dto/user-dashboard.dto';
import {
  ProgressAchievement,
  ProgressImprovement,
  ProgressLevel,
  ProgressRadarCompare,
  ProgressStreak,
  ProgressTimelineItem,
  UserProgress,
} from './progress.types';

const EXAM_DATE = new Date('2026-06-01'); // วันสอบจริง — ปรับได้
const PASS_THRESHOLD = 60; // เกณฑ์ผ่าน — ปรับได้

/** ระดับของผู้เรียน คิดจากคะแนนเฉลี่ย — ปรับเกณฑ์ได้ที่นี่ที่เดียว */
const LEVELS = [
  { code: 'bronze', name: 'Bronze', min: 0 },
  { code: 'silver', name: 'Silver', min: 30 },
  { code: 'gold', name: 'Gold', min: 50 },
  { code: 'platinum', name: 'Platinum', min: 70 },
];

const ONE_DAY = 24 * 60 * 60 * 1000;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** ความคืบหน้าเป็น % เทียบกับเป้าหมาย จำกัดไว้ที่ 0-100 */
const pct = (value: number, goal: number) =>
  goal <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((value / goal) * 100)));

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

@Injectable()
export class UserDashboardService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(ExamSession)
    private sessionRepo: Repository<ExamSession>,

    @InjectRepository(CATSession)
    private catSessionRepo: Repository<CATSession>,

  ) {}

  async getUserDashboard(userId: number): Promise<UserDashboardDto> {
    const [stats, ranking, radarData, weakTopics, progress] = await Promise.all([
      this.getStats(userId),
      this.getRanking(userId),
      this.getRadarData(userId),
      this.getWeakTopics(userId),
      this.getProgress(userId),
    ]);

    return {
      stats,
      ranking,
      radar_data: radarData,
      weak_topics: weakTopics,
      progress,
    };
  }

  // ── 5. Progress — พัฒนาการรายครั้ง ระดับ สตรีค และแบดจ์ ──────────────────
  //
  // คำนวณสดจาก exam_sessions ทั้งหมด จึงไม่ต้องมีตารางเก็บสถานะแบดจ์เพิ่ม
  // (แลกกับการคำนวณใหม่ทุกครั้งที่เปิดหน้า ซึ่งข้อมูลต่อคนมีไม่มาก)

  private async getProgress(userId: number): Promise<UserProgress> {
    const sessions = await this.sessionRepo.find({
      where: { userId, session_type: 'NORMAL' },
      relations: { item_bank: true },
      order: { end_time: 'ASC' },
    });

    const finished = sessions.filter((s) => s.end_time);

    const timeline: ProgressTimelineItem[] = finished.map((session, idx) => {
      const score = round1(session.final_score ?? 0);
      const prevScore = idx > 0 ? (finished[idx - 1].final_score ?? 0) : null;

      return {
        session_id: Number(session.session_id),
        attempt: idx + 1,
        date: new Date(session.end_time).toISOString(),
        exam_name: session.item_bank?.bank_name ?? `ชุดข้อสอบ #${session.session_id}`,
        score,
        accuracy: this.accuracyOf(session),
        score_delta: prevScore === null ? null : round1(score - prevScore),
        duration_minutes: this.durationMinutesOf(session),
      };
    });

    const [radarCompare, improvement] = await Promise.all([
      this.getRadarCompare(userId, finished),
      Promise.resolve(this.buildImprovement(timeline)),
    ]);

    return {
      timeline: timeline.slice(-20), // เก็บเฉพาะ 20 ครั้งล่าสุดพอสำหรับกราฟ
      improvement,
      radar_compare: radarCompare,
      level: this.buildLevel(timeline),
      streak: this.buildStreak(finished),
      achievements: this.buildAchievements(finished, timeline),
    };
  }

  private accuracyOf(session: ExamSession): number | null {
    const responses = Array.isArray(session.responses) ? session.responses : [];
    if (responses.length === 0) return null;

    const correct = responses.filter((r) => r?.is_correct).length;
    return Math.round((correct / responses.length) * 100);
  }

  private durationMinutesOf(session: ExamSession): number | null {
    if (!session.start_time || !session.end_time) return null;

    const diffMs =
      new Date(session.end_time).getTime() - new Date(session.start_time).getTime();
    return diffMs > 0 ? Math.round(diffMs / (1000 * 60)) : 0;
  }

  private buildImprovement(timeline: ProgressTimelineItem[]): ProgressImprovement {
    const empty: ProgressImprovement = {
      first_score: null,
      last_score: null,
      best_score: null,
      score_delta: null,
      total_gain: null,
      accuracy: null,
      accuracy_delta: null,
      duration_delta: null,
    };
    if (timeline.length === 0) return empty;

    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    const prev = timeline.length > 1 ? timeline[timeline.length - 2] : null;

    const delta = (a: number | null, b: number | null | undefined) =>
      a === null || b === null || b === undefined ? null : round1(a - b);

    return {
      first_score: first.score,
      last_score: last.score,
      best_score: round1(Math.max(...timeline.map((t) => t.score))),
      score_delta: last.score_delta,
      total_gain: timeline.length > 1 ? round1(last.score - first.score) : null,
      accuracy: last.accuracy,
      accuracy_delta: delta(last.accuracy, prev?.accuracy ?? null),
      duration_delta: delta(last.duration_minutes, prev?.duration_minutes ?? null),
    };
  }

  /** เทียบคะแนนรายหมวดของการสอบครั้งแรกกับครั้งล่าสุด — เอาเฉพาะหมวดที่มีทั้งสองครั้ง */
  private async getRadarCompare(
    userId: number,
    finished: ExamSession[],
  ): Promise<ProgressRadarCompare[]> {
    if (finished.length < 2) return [];

    const firstId = Number(finished[0].session_id);
    const lastId = Number(finished[finished.length - 1].session_id);

    const [firstScores, lastScores] = await Promise.all([
      this.getTopicScoresBySession(userId, firstId),
      this.getTopicScoresBySession(userId, lastId),
    ]);

    return Object.keys(lastScores)
      .filter((subject) => subject in firstScores)
      .map((subject) => ({
        subject,
        first: firstScores[subject],
        latest: lastScores[subject],
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'th'));
  }

  private async getTopicScoresBySession(
    userId: number,
    sessionId: number,
  ): Promise<Record<string, number>> {
    const raw: { subject: string; total: string; correct: string }[] =
      await this.sessionRepo.manager.query(
        `
        WITH resp AS (
          SELECT
            (r->>'item_id')::int     AS item_id,
            (r->>'is_correct')::bool AS is_correct
          FROM exam_sessions s,
               jsonb_array_elements(s.responses) AS r
          WHERE s.user_id    = $1
            AND s.session_id = $2
            AND s.responses  IS NOT NULL
            AND jsonb_array_length(s.responses) > 0
        )
        SELECT
          t.topic_name                                           AS subject,
          COUNT(resp.item_id)::text                              AS total,
          SUM(CASE WHEN resp.is_correct THEN 1 ELSE 0 END)::text AS correct
        FROM resp
        JOIN item_sub_topics ist ON ist.item_id      = resp.item_id
        JOIN sub_topics      st  ON st.sub_topic_id  = ist.sub_topic_id
        JOIN topics          t   ON t.topic_id       = st.topic_id
        GROUP BY t.topic_name
        `,
        [userId, sessionId],
      );

    return raw.reduce<Record<string, number>>((acc, row) => {
      const total = Number(row.total) || 0;
      const correct = Number(row.correct) || 0;
      acc[row.subject ?? 'ไม่ระบุ'] = total > 0 ? Math.round((correct / total) * 100) : 0;
      return acc;
    }, {});
  }

  private buildLevel(timeline: ProgressTimelineItem[]): ProgressLevel {
    const score =
      timeline.length > 0
        ? round1(this.average(timeline.map((t) => t.score)))
        : 0;

    const currentIdx = LEVELS.reduce(
      (acc, level, idx) => (score >= level.min ? idx : acc),
      0,
    );
    const current = LEVELS[currentIdx];
    const next = LEVELS[currentIdx + 1] ?? null;

    const progressPct = next
      ? Math.min(
          100,
          Math.max(0, ((score - current.min) / (next.min - current.min)) * 100),
        )
      : 100;

    return {
      code: current.code,
      name: current.name,
      next_code: next?.code ?? null,
      next_name: next?.name ?? null,
      progress_pct: Math.round(progressPct),
      score,
      points_to_next: next ? round1(Math.max(0, next.min - score)) : null,
    };
  }

  /** นับวันที่ทำข้อสอบต่อเนื่อง โดยนับแบบ "วัน" ไม่ใช่จำนวนครั้ง */
  private buildStreak(finished: ExamSession[]): ProgressStreak {
    const days = [
      ...new Set(finished.map((s) => startOfDay(new Date(s.end_time)))),
    ].sort((a, b) => a - b);

    if (days.length === 0) {
      return {
        current_days: 0,
        longest_days: 0,
        last_active: null,
        active_days_last_week: 0,
      };
    }

    let longest = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      run = days[i] - days[i - 1] === ONE_DAY ? run + 1 : 1;
      longest = Math.max(longest, run);
    }

    // สตรีคปัจจุบันนับต่อเนื่องได้ก็ต่อเมื่อครั้งล่าสุดคือวันนี้หรือเมื่อวาน
    const today = startOfDay(new Date());
    const lastDay = days[days.length - 1];
    const current = today - lastDay <= ONE_DAY ? run : 0;

    const weekAgo = today - 6 * ONE_DAY;

    return {
      current_days: current,
      longest_days: longest,
      last_active: new Date(lastDay).toISOString(),
      active_days_last_week: days.filter((d) => d >= weekAgo).length,
    };
  }

  private buildAchievements(
    finished: ExamSession[],
    timeline: ProgressTimelineItem[],
  ): ProgressAchievement[] {
    const streak = this.buildStreak(finished);
    const accuracies = timeline
      .map((t) => t.accuracy)
      .filter((a): a is number => a !== null);

    const dateOfAttempt = (attempt: number) =>
      timeline[attempt - 1]?.date ?? null;

    /** วันที่ของครั้งแรกที่เข้าเงื่อนไข — ใช้เป็นวันปลดล็อกแบดจ์ */
    const firstDateWhere = (
      predicate: (item: ProgressTimelineItem) => boolean,
    ) => timeline.find(predicate)?.date ?? null;

    const bestScore = timeline.length > 0 ? Math.max(...timeline.map((t) => t.score)) : 0;
    const bestAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : 0;
    const bestImprovement = Math.max(
      0,
      ...timeline.map((t) => t.score_delta ?? 0),
    );

    return [
      {
        code: 'first_exam',
        title: 'เริ่มต้นแล้ว',
        description: 'ทำข้อสอบครั้งแรกสำเร็จ',
        unlocked: timeline.length >= 1,
        unlocked_at: dateOfAttempt(1),
        progress_pct: timeline.length >= 1 ? 100 : 0,
      },
      {
        code: 'three_exams',
        title: 'ทำต่อเนื่อง 3 ครั้ง',
        description: 'ทำข้อสอบครบ 3 ครั้ง',
        unlocked: timeline.length >= 3,
        unlocked_at: dateOfAttempt(3),
        progress_pct: pct(timeline.length, 3),
      },
      {
        code: 'ten_exams',
        title: 'มือโปร',
        description: 'ทำข้อสอบครบ 10 ครั้ง',
        unlocked: timeline.length >= 10,
        unlocked_at: dateOfAttempt(10),
        progress_pct: pct(timeline.length, 10),
      },
      {
        code: 'fast_improve',
        title: 'พัฒนาเร็ว',
        description: 'คะแนนเพิ่มขึ้นจากครั้งก่อนมากกว่า 10 คะแนน',
        unlocked: bestImprovement > 10,
        unlocked_at: firstDateWhere((t) => (t.score_delta ?? 0) > 10),
        progress_pct: pct(bestImprovement, 10),
      },
      {
        code: 'high_accuracy',
        title: 'แม่นยำสูง',
        description: 'ตอบถูกมากกว่า 80% ในการสอบหนึ่งครั้ง',
        unlocked: bestAccuracy > 80,
        unlocked_at: firstDateWhere((t) => (t.accuracy ?? 0) > 80),
        progress_pct: pct(bestAccuracy, 80),
      },
      {
        code: 'passing_score',
        title: 'ผ่านเกณฑ์',
        description: `ทำคะแนนถึงเกณฑ์ผ่าน ${PASS_THRESHOLD} คะแนน`,
        unlocked: bestScore >= PASS_THRESHOLD,
        unlocked_at: firstDateWhere((t) => t.score >= PASS_THRESHOLD),
        progress_pct: pct(bestScore, PASS_THRESHOLD),
      },
      {
        code: 'streak_3',
        title: 'ฝึกฝนสม่ำเสมอ',
        description: 'ทำข้อสอบต่อเนื่อง 3 วันติดกัน',
        unlocked: streak.longest_days >= 3,
        unlocked_at: null,
        progress_pct: pct(streak.longest_days, 3),
      },
    ];
  }

  // ── 1. Stats ──────────────────────────────────────────────────────────────

  private async getStats(userId: number) {
    // เฉพาะ Normal exam เท่านั้น — CAT session ไม่ set final_score ในตารางนี้
    // (นับแยกเป็น cat_exams_count ด้านล่างแทน กันไม่ให้ไปทำ average_score เพี้ยน)
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.session_type = :type', { type: 'NORMAL' })
      .andWhere('s.end_time IS NOT NULL')
      .orderBy('s.end_time', 'DESC')
      .getMany();

    const catExamsCount = await this.catSessionRepo
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.end_time IS NOT NULL')
      .getCount();

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
      cat_exams_count: catExamsCount,
    };
  }

  // ── 2. Ranking ────────────────────────────────────────────────────────────

  private async getRanking(userId: number) {
    // เฉพาะ Normal exam เท่านั้น — CAT ไม่มี final_score เทียบกันตรงๆ ได้ (กันไม่ให้ปนเข้ามาแบบไม่ตั้งใจ)
    const rankRaw = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'uid')
      .addSelect('AVG(s.final_score)', 'avg')
      .where('s.session_type = :type', { type: 'NORMAL' })
      .andWhere('s.end_time IS NOT NULL')
      .andWhere('s.final_score IS NOT NULL')
      .groupBy('s.user_id')
      .getRawMany();

    const sorted = rankRaw
      .map((r) => ({ uid: Number(r.uid), avg: Number(r.avg) || 0 }))
      .sort((a, b) => b.avg - a.avg);

    // นับ total users จากตาราง users ทั้งหมด แทนที่จะนับจากคนที่ทำข้อสอบ
    const totalUsers = await this.userRepo.count();
    const idx = sorted.findIndex((r) => r.uid === userId);
    const currentRank = idx >= 0 ? idx + 1 : totalUsers;
    const percentile =
      totalUsers > 0 ? ((totalUsers - currentRank) / totalUsers) * 100 : 0;

    const userScore = sorted.find((r) => r.uid === userId)?.avg ?? 0;
    const topScore = sorted[0]?.avg ?? 0;
    const globalAvg =
      sorted.length > 0
        ? sorted.reduce((s, r) => s + r.avg, 0) / sorted.length
        : 0;

    const rankChange = await this.getRankChange(userId, sorted);

    // คนที่อยู่เหนือ/ใต้เรา 1 อันดับ — ใช้ทำ "ตามอยู่กี่คะแนน / นำอยู่กี่คะแนน"
    const nextUp = idx > 0 ? sorted[idx - 1] : null;
    const nextDown =
      idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
      current_rank: currentRank,
      total_users: totalUsers,
      percentile: Math.round(percentile * 10) / 10,
      rank_change: rankChange,
      is_ranked: idx >= 0,
      next_rank_score: nextUp ? round1(nextUp.avg) : null,
      prev_rank_score: nextDown ? round1(nextDown.avg) : null,
      gap_to_next: nextUp ? round1(Math.max(0, nextUp.avg - userScore)) : null,
      lead_over_prev: nextDown
        ? round1(Math.max(0, userScore - nextDown.avg))
        : null,
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
      .where('s.session_type = :type', { type: 'NORMAL' })
      .andWhere('s.end_time IS NOT NULL')
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
      HAVING COUNT(resp.item_id) >= 1
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
