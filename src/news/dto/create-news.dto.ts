export class CreateNewsDto {
  title: string;
  content: any;
  excerpt?: string;
  author_id: number;
  cover_image_url?: string;
  status?: string;
  categoryIds?: number[];
  tagIds?: number[];
}
