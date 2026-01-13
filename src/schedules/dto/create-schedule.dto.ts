export class CreateScheduleDto {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  is_public: boolean;
  is_draft: boolean;
}
