import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, In } from 'typeorm';
import { ChatbotDocument } from '../chat/entities/chatbot_document.entity';
import { User } from '../users/entities/user.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

// Pinecone & Gemini
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
const pdfParse = require('pdf-parse');

function getContentTypeByFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain; charset=utf-8';
    case 'csv': return 'text/csv; charset=utf-8';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc': return 'application/msword';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    default: return 'application/octet-stream';
  }
}

@Injectable()
export class ChatbotDocumentsService {
  private readonly logger = new Logger(ChatbotDocumentsService.name);
  private pinecone: Pinecone;
  private genAI: GoogleGenerativeAI;
  private pineconeIndex: any;

  constructor(
    @InjectRepository(ChatbotDocument)
    private readonly chatbotDocumentRepo: Repository<ChatbotDocument>,
  ) {
    // ตรวจสอบ env vars ตั้งแต่เริ่มต้น
    const requiredEnv: [string, string | undefined][] = [
      ['GEMINI_API_KEY', process.env.GEMINI_API_KEY],
      ['PINECONE_API_KEY', process.env.PINECONE_API_KEY],
      ['PINECONE_INDEX', process.env.PINECONE_INDEX],
    ];
    const missing = requiredEnv
      .filter(([name, value]) => !value || String(value).startsWith('YOUR_'))
      .map(([name]) => name);

    if (missing.length > 0) {
      this.logger.warn(
        `ChatbotDocumentsService: missing environment variable(s): ${missing.join(', ')}. ` +
        `กรุณาตั้งค่าใน Railway Dashboard → Variables ก่อนใช้งานฟีเจอร์นี้`,
      );
    }

    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    }

    if (process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX) {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY as string,
      });
      this.pineconeIndex = this.pinecone.index(process.env.PINECONE_INDEX as string);
    }
  }

  // Helper สำหรับตัดข้อความเป็นก้อนๆ (Chunking) เพื่อให้ RAG ทำงานได้ดีที่สุด
  private chunkText(text: string, chunkSize: number = 2000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + chunkSize));
      i += chunkSize - overlap;
    }
    return chunks;
  }

  // Helper สำหรับสกัดข้อความจากประเภทไฟล์ต่างๆ (PDF, TXT, CSV, DOCX, DOC, XLSX, XLS)
  private async extractTextFromFile(file: Express.Multer.File, ext: string): Promise<string> {
    if (ext === 'pdf') {
      const parseFunction = typeof pdfParse === 'function' ? pdfParse : (pdfParse.PDFParse || pdfParse.default);
      const pdfData = await parseFunction(file.buffer);
      return pdfData.text.replace(/\n/g, ' ').trim();
    }

    if (ext === 'txt' || ext === 'csv') {
      return file.buffer.toString('utf-8').trim();
    }

    if (ext === 'docx' || ext === 'doc') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value.replace(/\n/g, ' ').trim();
      } catch (e) {
        this.logger.warn(`Mammoth docx parse failed, fallback text: ${e}`);
        return file.buffer.toString('utf-8').replace(/[^\x20-\x7E\u0E00-\u0E7F\n]/g, ' ').trim();
      }
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer as any);
      const rowsText: string[] = [];
      workbook.eachSheet((worksheet) => {
        rowsText.push(`[แผ่นงาน: ${worksheet.name}]`);
        worksheet.eachRow((row) => {
          const values = Array.isArray(row.values)
            ? row.values
                .filter(v => v !== null && v !== undefined)
                .map(v => typeof v === 'object' && v && 'text' in (v as any) ? (v as any).text : String(v))
            : [];
          if (values.length > 0) {
            rowsText.push(values.join(' | '));
          }
        });
      });
      return rowsText.join('\n').trim();
    }

    // Generic fallback
    return file.buffer.toString('utf-8').trim();
  }

  async getAllDocuments(): Promise<ChatbotDocument[]> {
    return this.chatbotDocumentRepo.find({
      order: { uploaded_at: 'DESC' },
      relations: ['user']
    });
  }

  async getDeletedDocuments(): Promise<ChatbotDocument[]> {
    return this.chatbotDocumentRepo.find({
      withDeleted: true,
      where: {
        deleted_at: Not(IsNull())
      },
      order: { deleted_at: 'DESC' },
      relations: ['user']
    });
  }

  async getDocumentFile(id: number): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    const doc = await this.chatbotDocumentRepo.findOne({
      where: { id },
      withDeleted: true
    });

    if (!doc) {
      throw new NotFoundException('ไม่พบเอกสารนี้ในระบบ');
    }

    const contentType = getContentTypeByFileName(doc.file_name);

    if (doc.file_path && fs.existsSync(doc.file_path)) {
      const buffer = fs.readFileSync(doc.file_path);
      return { buffer, fileName: doc.file_name, contentType };
    }

    if (doc.file_url) {
      const fallbackPath = path.join(process.cwd(), doc.file_url.replace(/^\//, ''));
      if (fs.existsSync(fallbackPath)) {
        const buffer = fs.readFileSync(fallbackPath);
        return { buffer, fileName: doc.file_name, contentType };
      }
    }

    throw new NotFoundException('ไม่พบไฟล์เอกสารต้นฉบับบนเซิร์ฟเวอร์');
  }

  async uploadAndProcessDocument(file: Express.Multer.File, userId: number): Promise<ChatbotDocument> {
    const cleanOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = cleanOriginalName.split('.').pop()?.toLowerCase() || '';

    const allowed = ['pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx'];
    if (!allowed.includes(ext)) {
      throw new BadRequestException(`รองรับเฉพาะไฟล์ ${allowed.map(e => '.' + e).join(', ')} เท่านั้น`);
    }

    // บันทึกไฟล์ลง Disk เพื่อเปิดอ่านและดาวน์โหลด
    const uploadDir = path.join(process.cwd(), 'uploads', 'chatbot_docs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const safeBaseName = cleanOriginalName.replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_');
    const savedFileName = `${Date.now()}-${safeBaseName}`;
    const fullPath = path.join(uploadDir, savedFileName);
    fs.writeFileSync(fullPath, file.buffer);

    // 1. สร้าง Record ในระบบเพื่อรับ ID อ้างอิง
    const doc = this.chatbotDocumentRepo.create({
      file_name: cleanOriginalName,
      file_size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      file_url: `/uploads/chatbot_docs/${savedFileName}`,
      file_path: fullPath,
      uploaded_by: userId,
    });
    
    // บันทึกใส่เบสเพื่อให้ได้ doc.id มาประทับตราตอนยัดลง Pinecone
    const savedDoc = await this.chatbotDocumentRepo.save(doc);

    try {
      this.logger.log(`Parsing document: ${savedDoc.file_name} (${ext.toUpperCase()}) (ID: ${savedDoc.id})`);
      
      // 2. แกะข้อความจากไฟล์ตามประเภท
      const rawText = await this.extractTextFromFile(file, ext);

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('ไม่พบข้อมูลข้อความในไฟล์นี้ หรือรูปแบบไฟล์ไม่สามารถอ่านข้อความได้');
      }

      // 3. หั่นไฟล์ (Chunking) เพื่อกระจายเข้า Vector DB
      const chunks = this.chunkText(rawText);
      this.logger.log(`Document parsed successfully. Separated into ${chunks.length} chunks.`);

      if (this.genAI) {
        const embeddingModel = this.genAI.getGenerativeModel({ model: "gemini-embedding-001" });

        // 4. สร้าง Embedding ด้วย Gemini และบันทึกลง Pinecone ทีละชุด (Batches)
        const batchSize = 50; 
        for (let i = 0; i < chunks.length; i += batchSize) {
          const chunkBatch = chunks.slice(i, i + batchSize);
          
          const requests = chunkBatch.map(content => ({
              content: { role: 'user', parts: [{ text: content }] },
              outputDimensionality: 768
          }));

          const result = await embeddingModel.batchEmbedContents({ requests });
          const embeddings = result.embeddings;

          const vectors = (embeddings || []).map((emb, idx) => {
            let finalValues: number[] = [];
            if (emb.values) {
              finalValues = Array.from(emb.values as any);
            } else if (emb['embedding']?.values) {
              finalValues = Array.from(emb['embedding'].values as any);
            }

            return {
              id: `doc-${savedDoc.id}-chunk-${i + idx}`,
              values: finalValues,
              metadata: {
                document_id: savedDoc.id,
                file_name: savedDoc.file_name,
                text: chunkBatch[idx],
              },
            };
          });

          const validVectors = vectors.filter(v => v.values && v.values.length > 0);
          this.logger.log(`Batch ${(i / batchSize) + 1}: ${validVectors.length} valid vectors (${validVectors[0]?.values?.length ?? 0} dims each)`);

          if (validVectors.length > 0 && this.pineconeIndex) {
            const ns = this.pineconeIndex.namespace(`doc-${savedDoc.id}`);
            await ns.upsert({ records: validVectors });
            this.logger.log(`Upsert successful: Batch ${(i / batchSize) + 1} with ${validVectors.length} vectors into namespace doc-${savedDoc.id}`);
          }

          // พักระหว่าง batch เล็กน้อย เพื่อลดโอกาสชน Rate Limit
          if (i + batchSize < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      this.logger.log(`Successfully processed and vectorized document ${savedDoc.id}`);
      return savedDoc;

    } catch (error) {
      this.logger.error(`Error processing document ${savedDoc.id}:`, error);
      
      // Cleanup file if processing fails
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch {}
      }

      if (this.pineconeIndex) {
        try {
          await this.pineconeIndex.namespace(`doc-${savedDoc.id}`).deleteAll();
        } catch (cleanupError) {
          this.logger.error(`Failed to cleanup Pinecone namespace for document ${savedDoc.id}:`, cleanupError);
        }
      }
      
      await this.chatbotDocumentRepo.delete(savedDoc.id);

      const errString = (error instanceof Error ? error.message : String(error));
      if (
        errString.includes('429') ||
        errString.toLowerCase().includes('quota') ||
        errString.toLowerCase().includes('too many requests') ||
        errString.toLowerCase().includes('resource_exhausted')
      ) {
        throw new BadRequestException(
          'ไม่สามารถอัปโหลดไฟล์ได้ในขณะนี้ เนื่องจากโมเดล AI ติดลิมิตชั่วคราว (Gemini Quota Exceeded) กรุณารอสักครู่ (ประมาณ 1-2 นาที) แล้วลองใหม่อีกครั้ง',
        );
      }

      const errorMessage = errString.slice(0, 300);
      throw new BadRequestException(
        `เกิดข้อผิดพลาดในการประมวลผลเอกสารและเพิ่มเข้า Pinecone: ${errorMessage}`,
      );
    }
  }

  // ── Soft Delete ──
  async softDeleteDocument(id: number): Promise<{ success: boolean }> {
    const doc = await this.chatbotDocumentRepo.findOneBy({ id });
    if (!doc) {
      throw new NotFoundException('ไม่พบเอกสารนี้ในระบบ');
    }
    await this.chatbotDocumentRepo.softDelete(id);
    return { success: true };
  }

  async softDeleteMultipleDocuments(ids: number[]): Promise<{ success: boolean; count: number }> {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    await this.chatbotDocumentRepo.softDelete({ id: In(ids) });
    return { success: true, count: ids.length };
  }

  // ── Restore ──
  async restoreDocument(id: number): Promise<{ success: boolean }> {
    await this.chatbotDocumentRepo.restore(id);
    return { success: true };
  }

  async restoreMultipleDocuments(ids: number[]): Promise<{ success: boolean; count: number }> {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    await this.chatbotDocumentRepo.restore({ id: In(ids) });
    return { success: true, count: ids.length };
  }

  // ── Permanent Delete ──
  async permanentDeleteDocument(id: number): Promise<{ success: boolean }> {
    const doc = await this.chatbotDocumentRepo.findOne({
      where: { id },
      withDeleted: true
    });

    if (doc?.file_path && fs.existsSync(doc.file_path)) {
      try { fs.unlinkSync(doc.file_path); } catch {}
    }

    if (this.pineconeIndex) {
      try {
        await this.pineconeIndex.namespace(`doc-${id}`).deleteAll();
        this.logger.log(`Deleted all vectors in namespace doc-${id}`);
      } catch (error) {
        this.logger.error(`Error deleting Pinecone namespace for document ${id}:`, error);
      }
    }

    await this.chatbotDocumentRepo.delete(id);
    return { success: true };
  }

  async permanentDeleteMultipleDocuments(ids: number[]): Promise<{ success: boolean; count: number }> {
    if (!ids || ids.length === 0) return { success: true, count: 0 };

    const docs = await this.chatbotDocumentRepo.find({
      where: { id: In(ids) },
      withDeleted: true
    });

    for (const doc of docs) {
      if (doc.file_path && fs.existsSync(doc.file_path)) {
        try { fs.unlinkSync(doc.file_path); } catch {}
      }
    }

    if (this.pineconeIndex) {
      for (const id of ids) {
        try {
          await this.pineconeIndex.namespace(`doc-${id}`).deleteAll();
        } catch (error) {
          this.logger.error(`Error deleting Pinecone namespace for document ${id}:`, error);
        }
      }
    }

    await this.chatbotDocumentRepo.delete({ id: In(ids) });
    return { success: true, count: ids.length };
  }
}
