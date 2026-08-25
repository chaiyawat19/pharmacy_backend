export class UserDashboardDto {
    stats: {
        total_exams: number
        passed_exams: number
        failed_exams: number
        average_score: number
        last_exam_score: number
        improvement_rate: number
        days_until_exam: number
        study_minutes: number
        cat_exams_count: number
    }

    ranking: {
        current_rank: number
        total_users: number
        percentile: number
        rank_change: number
        score_range: {
            top: number
            user_score: number
            average: number
        }
    }

    radar_data: {
        subject: string
        score: number
        full_mark: number
    }[]

    weak_topics: {
        subject: string
        topic: string
        score: number
        priority: 'ต้องรีบทบทวน!' | 'ควรทบทวนเพิ่มเติม' | 'พอใช้ แต่ควรฝึกฝนเพิ่มเติม' | 'ทำได้ดี'
        study_time: string
        resources: number
    }[]
}