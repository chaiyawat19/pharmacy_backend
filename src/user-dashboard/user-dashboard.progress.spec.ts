import { UserDashboardService } from './user-dashboard.service';

/**
 * ทดสอบเฉพาะส่วน progress — ใช้ repo ปลอม จึงไม่ต้องต่อฐานข้อมูลจริง
 */
describe('UserDashboardService — progress', () => {
  const day = 24 * 60 * 60 * 1000;
  const at = (daysAgo: number, hour = 9) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return new Date(d.getTime() - daysAgo * day);
  };

  const session = (
    id: number,
    daysAgo: number,
    score: number,
    correct: number,
    total: number,
    minutes = 30,
  ) => ({
    session_id: id,
    userId: 1,
    session_type: 'NORMAL',
    start_time: new Date(at(daysAgo).getTime() - minutes * 60 * 1000),
    end_time: at(daysAgo),
    final_score: score,
    responses: Array.from({ length: total }, (_, i) => ({
      item_id: i + 1,
      is_correct: i < correct,
    })),
    item_bank: { bank_name: `ชุดที่ ${id}` },
  });

  /** สร้าง service พร้อม repo ปลอมที่คืน sessions ตามที่กำหนด */
  const buildService = (sessions: any[], topicScores: Record<string, any[]> = {}) => {
    const sessionRepo: any = {
      find: jest.fn().mockResolvedValue(sessions),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'orderBy']) {
          qb[m] = jest.fn(() => qb);
        }
        qb.getMany = jest.fn().mockResolvedValue(sessions);
        qb.getRawMany = jest.fn().mockResolvedValue([]);
        qb.getCount = jest.fn().mockResolvedValue(0);
        return qb;
      }),
      manager: {
        query: jest.fn((_sql: string, params: any[]) =>
          Promise.resolve(topicScores[String(params[1])] ?? []),
        ),
      },
    };
    const userRepo: any = { count: jest.fn().mockResolvedValue(10) };
    const catRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };

    return new UserDashboardService(userRepo, sessionRepo, catRepo);
  };

  const getProgress = (service: UserDashboardService) =>
    (service as any).getProgress(1);

  it('คืนค่าว่างอย่างปลอดภัยเมื่อยังไม่เคยสอบ', async () => {
    const progress = await getProgress(buildService([]));

    expect(progress.timeline).toEqual([]);
    expect(progress.improvement.last_score).toBeNull();
    expect(progress.level.name).toBe('Bronze');
    expect(progress.streak.current_days).toBe(0);
    expect(progress.achievements.every((a: any) => !a.unlocked)).toBe(true);
  });

  it('สร้างไทม์ไลน์พร้อมส่วนต่างคะแนนและความแม่นยำรายครั้ง', async () => {
    const progress = await getProgress(
      buildService([
        session(1, 5, 20, 2, 10),
        session(2, 3, 35, 7, 10),
        session(3, 1, 62, 9, 10),
      ]),
    );

    expect(progress.timeline).toHaveLength(3);
    expect(progress.timeline[0]).toMatchObject({ attempt: 1, score: 20, accuracy: 20, score_delta: null });
    expect(progress.timeline[2]).toMatchObject({ attempt: 3, score: 62, accuracy: 90, score_delta: 27 });
    expect(progress.improvement).toMatchObject({
      first_score: 20,
      last_score: 62,
      best_score: 62,
      score_delta: 27,
      total_gain: 42,
      accuracy: 90,
      accuracy_delta: 20,
    });
  });

  it('คิดระดับจากคะแนนเฉลี่ยและบอกว่าต้องได้อีกกี่คะแนน', async () => {
    const progress = await getProgress(
      buildService([session(1, 2, 30, 5, 10), session(2, 1, 50, 5, 10)]),
    );

    // เฉลี่ย 40 → Silver (30) กำลังไป Gold (50) ได้ครึ่งทาง
    expect(progress.level).toMatchObject({
      code: 'silver',
      next_code: 'gold',
      score: 40,
      progress_pct: 50,
      points_to_next: 10,
    });
  });

  it('นับสตรีคเป็นจำนวนวัน ไม่ใช่จำนวนครั้ง', async () => {
    const progress = await getProgress(
      buildService([
        session(1, 2, 40, 5, 10),
        session(2, 1, 45, 6, 10),
        session(3, 1, 50, 7, 10, 20), // วันเดียวกับครั้งก่อน ต้องไม่นับซ้ำ
        session(4, 0, 55, 8, 10),
      ]),
    );

    expect(progress.streak.current_days).toBe(3);
    expect(progress.streak.longest_days).toBe(3);
    expect(progress.streak.active_days_last_week).toBe(3);
  });

  it('ปลดล็อกแบดจ์ตามเงื่อนไข และรายงานความคืบหน้าของอันที่ยังไม่ได้', async () => {
    const progress = await getProgress(
      buildService([session(1, 2, 20, 2, 10), session(2, 1, 65, 9, 10)]),
    );

    const badge = (code: string) =>
      progress.achievements.find((a: any) => a.code === code);

    expect(badge('first_exam').unlocked).toBe(true);
    expect(badge('fast_improve').unlocked).toBe(true); // +45 คะแนน
    expect(badge('high_accuracy').unlocked).toBe(true); // 90%
    expect(badge('passing_score').unlocked).toBe(true); // 65 ≥ 60
    expect(badge('ten_exams').unlocked).toBe(false);
    expect(badge('ten_exams').progress_pct).toBe(20); // 2 จาก 10 ครั้ง
  });

  it('เทียบเรดาร์ครั้งแรกกับครั้งล่าสุดเฉพาะหมวดที่มีทั้งสองครั้ง', async () => {
    const service = buildService(
      [session(1, 3, 30, 3, 10), session(2, 1, 70, 7, 10)],
      {
        '1': [
          { subject: 'Asthma', total: '10', correct: '3' },
          { subject: 'COPD', total: '10', correct: '5' },
        ],
        '2': [
          { subject: 'Asthma', total: '10', correct: '8' },
          { subject: 'Herbal', total: '10', correct: '9' }, // ครั้งแรกไม่มี → ไม่ถูกนำมาเทียบ
        ],
      },
    );

    const progress = await getProgress(service);

    expect(progress.radar_compare).toEqual([
      { subject: 'Asthma', first: 30, latest: 80 },
    ]);
  });
});
