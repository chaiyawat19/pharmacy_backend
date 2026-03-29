export class AdminDashboardDto {
    stats: {
        total_users: number
        total_item_banks: number
        total_exam_sessions: number
        average_score: number
    }

    charts: {
        monthly_sessions: any[]
    }

    recent_activity: any[]
}