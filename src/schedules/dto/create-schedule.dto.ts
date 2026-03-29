export class CreateScheduleDto {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  type_event?: string[];
  is_public?: boolean;
}
