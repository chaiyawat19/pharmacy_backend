# CAT (Computerized Adaptive Testing) Module

ระบบข้อสอบแบบปรับตัวที่ใช้ IRT (Item Response Theory) แบบ 3-Parameter Logistic Model

## 🎯 คุณสมบัติ

### 1. **IRT Engine** (`irt.service.ts`)
- คำนวณความน่าจะเป็นในการตอบถูก (3PL Model)
- คำนวณ Fisher Information
- ประมาณค่า Theta (ความสามารถผู้สอบ) ด้วยวิธี EAP (Expected A Posteriori)
- คำนวณ Standard Error

### 2. **CAT Engine** (`cat.service.ts`)
- เลือกข้อสอบแรก (ระดับความยากปานกลาง)
- เลือกข้อถัดไปที่ให้ Information สูงสุด
- ตรวจสอบเงื่อนไขหยุดการสอบ:
  - ถึงจำนวนข้อสูงสุด
  - SE ต่ำกว่าเป้าหมาย
  - มั่นใจว่าสอบผ่าน/ไม่ผ่าน (Confidence-based)
- ตัดสินผลการสอบ

### 3. **CAT Exam Service** (`cat-exam.service.ts`)
- จัดการ Session การสอบ
- บันทึกประวัติการตอบ
- คำนวณ Theta และ SE แบบ real-time
- ส่งข้อสอบถัดไปอัตโนมัติ

## 📊 API Endpoints

### เริ่มการสอบ CAT
```http
POST /cat/start
Authorization: Bearer <token>

Body:
{
  "item_bank_id": 1,
  "min_items": 20,      // จำนวนข้อขั้นต่ำ (default: 20)
  "max_items": 50,      // จำนวนข้อสูงสุด (default: 50)
  "target_se": 0.35,    // SE เป้าหมาย (default: 0.35)
  "cut_score": 0.0,     // คะแนนผ่าน (default: 0.0)
  "mode": "real"        // 'real' | 'demo-easy' | 'demo-medium' | 'demo-hard'
}

Response:
{
  "message": "เริ่มการสอบ CAT สำเร็จ",
  "session_id": 1,
  "item_bank_id": 1,
  "current_item": { ... },  // ข้อสอบข้อแรก
  "current_theta": 0.0,
  "current_se": 999.0,
  "num_items": 0,
  "start_time": "2026-01-15T..."
}
```

### รับข้อสอบข้อถัดไป
```http
GET /cat/session/:session_id/next-item
Authorization: Bearer <token>

Response:
{
  "session_id": 1,
  "current_item": {
    "item_id": 123,
    "question_text": "...",
    "question_type": "multiple_choice",
    "irt_a_discrimination": 1.2,
    "irt_b_difficulty": 0.5,
    "irt_c_guessing": 0.25,
    "answer_options": [...]
  },
  "current_theta": 0.0,
  "current_se": 999.0,
  "num_items": 0
}
```

### ส่งคำตอบ
```http
POST /cat/submit-answer
Authorization: Bearer <token>

Body:
{
  "session_id": 1,
  "item_id": 123,
  "selected_option_id": 456,
  "response_time_ms": 15000
}

Response (ยังไม่จบ):
{
  "message": "ส่งคำตอบสำเร็จ",
  "finished": false,
  "is_correct": true,
  "session_id": 1,
  "current_theta": 0.45,
  "current_se": 0.82,
  "num_items": 1,
  "next_item": { ... }
}

Response (จบการสอบ):
{
  "message": "จบการสอบ",
  "finished": true,
  "session_id": 1,
  "final_theta": 0.85,
  "final_se": 0.32,
  "num_items": 25,
  "num_correct": 18,
  "passed": true,
  "stop_reason": "SE ต่ำกว่าเป้าหมาย (0.320)"
}
```

### ดูผลการสอบ
```http
GET /cat/session/:session_id/result
Authorization: Bearer <token>

Response:
{
  "session_id": 1,
  "item_bank_name": "ข้อสอบใบประกอบวิชาชีพเภสัชกรรม",
  "status": "COMPLETED",
  "start_time": "2026-01-15T...",
  "end_time": "2026-01-15T...",
  "final_theta": 0.85,
  "final_se": 0.32,
  "num_items": 25,
  "num_correct": 18,
  "passed": true,
  "stop_reason": "SE ต่ำกว่าเป้าหมาย",
  "responses": [...],
  "pass_percentile": 80.23
}
```

### ดูประวัติการสอบ
```http
GET /cat/history
Authorization: Bearer <token>

Response:
[
  {
    "session_id": 1,
    "item_bank_id": 1,
    "item_bank_name": "...",
    "status": "COMPLETED",
    "start_time": "...",
    "end_time": "...",
    "final_theta": 0.85,
    "num_items": 25,
    "num_correct": 18,
    "passed": true
  }
]
```

## 🔬 IRT 3PL Model

$$P(\theta) = c + \frac{1 - c}{1 + e^{-a(\theta - b)}}$$

**พารามิเตอร์:**
- **a** (Discrimination): ความสามารถในการแยกแยะผู้สอบที่มีความสามารถต่างกัน 
- **b** (Difficulty): ระดับความยากของข้อสอบ
- **c** (Guessing): ความน่าจะเป็นในการเดาถูก
- **θ** (Theta): ความสามารถของผู้สอบ

## 📈 Fisher Information

$$I(\theta) = \frac{a^2(P - c)^2(1 - P)}{(1 - c)^2 P}$$

**ใช้เพื่อ:**
- เลือกข้อสอบที่ให้ข้อมูลสูงสุดสำหรับความสามารถปัจจุบัน
- คำนวณ Standard Error: $SE(\theta) = \frac{1}{\sqrt{I(\theta)}}$

## 🎲 EAP Estimation

ใช้ Bayesian approach:
1. กำหนด Prior: N(0, 1)
2. คำนวณ Likelihood จากคำตอบที่ผ่านมา
3. Posterior = Likelihood × Prior
4. EAP = E[θ | responses]

## ⚙️ Stopping Rules

การสอบจะหยุดเมื่อ:
1. **ครบจำนวนข้อสูงสุด** (maxItems)
2. **SE ≤ targetSE** (ความแม่นยำเพียงพอ)
3. **Confidence-based**: CI ทั้งหมดอยู่ฝั่งผ่านหรือไม่ผ่าน
   - $\theta - 1.96 \times SE > \text{cutScore}$ → มั่นใจว่าผ่าน
   - $\theta + 1.96 \times SE < \text{cutScore}$ → มั่นใจว่าไม่ผ่าน

## 🗄️ Database Schema

```sql
CREATE TABLE cat_sessions (
  session_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_bank_id INTEGER NOT NULL,
  current_theta FLOAT8 DEFAULT 0.0,
  current_se FLOAT8 DEFAULT 999.0,
  num_items INTEGER DEFAULT 0,
  num_correct INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'IN_PROGRESS',
  used_item_ids JSONB,
  responses JSONB,
  current_item_id INTEGER,
  final_theta FLOAT8,
  final_se FLOAT8,
  passed BOOLEAN,
  stop_reason VARCHAR(255),
  min_items INTEGER DEFAULT 20,
  max_items INTEGER DEFAULT 50,
  target_se FLOAT8 DEFAULT 0.35,
  cut_score FLOAT8 DEFAULT 0.0,
  mode VARCHAR(50),
  start_time TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE
);
```

## 🚀 การใช้งาน

### 1. Import Module
```typescript
// app.module.ts
import { CATModule } from './cat/cat.module';

@Module({
  imports: [CATModule, ...],
  ...
})
export class AppModule {}
```

### 2. ตัวอย่างการใช้งาน Service
```typescript
// ใน service อื่นๆ
constructor(private readonly catExamService: CATExamService) {}

async startMyExam(userId: number) {
  return this.catExamService.startCATExam(userId, {
    item_bank_id: 1,
    min_items: 20,
    max_items: 50,
    target_se: 0.35,
    cut_score: 0.0,
    mode: 'real'
  });
}
```

## 📝 Notes

- ระบบจะเลือกข้อสอบที่ยังไม่เคยทำ และให้ Information สูงสุด
- การประมาณค่า Theta จะแม่นยำขึ้นเรื่อยๆ หลังทำข้อสอบมากขึ้น
- ระบบรองรับโหมด Demo สำหรับการทดสอบ (จำลองการตอบด้วย true ability)
- ทุกการตอบจะถูกบันทึกใน JSONB สำหรับวิเคราะห์ภายหลัง
