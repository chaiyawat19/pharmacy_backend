export class CreateNoteDto {
  title: string;
  content: string;
  tagIds?: any; // ปรับเป็น any เพื่อให้รองรับ string, string[] และ number[]
}