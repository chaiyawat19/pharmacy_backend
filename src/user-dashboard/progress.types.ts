/** ข้อมูลพัฒนาการของผู้เรียน — ใช้ในหน้า "ติดตามความคืบหน้า" */

export type ProgressTimelineItem = {
  session_id: number;
  attempt: number;
  /** ISO string — ให้ฝั่งหน้าเว็บจัดรูปแบบวันที่เอง */
  date: string;
  exam_name: string;
  score: number;
  /** % ข้อที่ตอบถูกในครั้งนั้น (null เมื่อไม่มีข้อมูลคำตอบ) */
  accuracy: number | null;
  /** ส่วนต่างคะแนนจากครั้งก่อนหน้า (null สำหรับครั้งแรก) */
  score_delta: number | null;
  duration_minutes: number | null;
};

/** ผลสอบ CAT รายครั้ง — CAT ไม่มีคะแนนเต็ม 100 จึงใช้ค่าความสามารถ (θ) แทน */
export type ProgressCatTimelineItem = {
  session_id: number;
  attempt: number;
  /** ISO string */
  date: string;
  /** ค่าความสามารถที่ประเมินได้ (ประมาณ −3 ถึง +3) */
  theta: number;
  /** ค่าความคลาดเคลื่อนมาตรฐานของ θ */
  se: number | null;
  /** เกณฑ์ผ่านของรอบนั้น (θ) */
  cut_score: number;
  passed: boolean | null;
  num_items: number;
  /** % ข้อที่ตอบถูก */
  accuracy: number | null;
};

export type ProgressImprovement = {
  first_score: number | null;
  last_score: number | null;
  best_score: number | null;
  /** คะแนนล่าสุดเทียบครั้งก่อนหน้า */
  score_delta: number | null;
  /** คะแนนล่าสุดเทียบครั้งแรกสุด */
  total_gain: number | null;
  accuracy: number | null;
  accuracy_delta: number | null;
  /** เวลาที่ใช้ทำข้อสอบครั้งล่าสุดเทียบครั้งก่อน (นาที, ติดลบ = เร็วขึ้น) */
  duration_delta: number | null;
};

export type ProgressRadarCompare = {
  subject: string;
  first: number;
  latest: number;
};

export type ProgressLevel = {
  code: string;
  name: string;
  /** ระดับถัดไป — null เมื่ออยู่ระดับสูงสุดแล้ว */
  next_code: string | null;
  next_name: string | null;
  /** ความคืบหน้าไปยังระดับถัดไป (0-100) */
  progress_pct: number;
  /** คะแนนเฉลี่ยที่ใช้คิดระดับ */
  score: number;
  /** ต้องได้เพิ่มอีกกี่คะแนนถึงระดับถัดไป */
  points_to_next: number | null;
};

export type ProgressStreak = {
  current_days: number;
  longest_days: number;
  /** วันล่าสุดที่ทำข้อสอบ (ISO date) */
  last_active: string | null;
  /** ทำข้อสอบไปแล้วกี่วันในรอบ 7 วันล่าสุด */
  active_days_last_week: number;
};

export type ProgressAchievement = {
  code: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** ISO string ของวันที่ปลดล็อก */
  unlocked_at: string | null;
  /** ความคืบหน้า 0-100 สำหรับแบดจ์ที่ยังไม่ปลดล็อก */
  progress_pct: number;
};

export type UserProgress = {
  timeline: ProgressTimelineItem[];
  /** แนวโน้มข้อสอบ CAT แยกจาก timeline ของข้อสอบปกติ (20 ครั้งล่าสุด) */
  cat_timeline: ProgressCatTimelineItem[];
  improvement: ProgressImprovement;
  radar_compare: ProgressRadarCompare[];
  level: ProgressLevel;
  streak: ProgressStreak;
  achievements: ProgressAchievement[];
};
