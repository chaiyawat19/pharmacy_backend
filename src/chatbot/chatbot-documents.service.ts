import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatbotDocument } from '../chat/entities/chatbot_document.entity';
import { User } from '../users/entities/user.entity';

// Pinecone & Gemini
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
const pdfParse = require('pdf-parse');

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
    // ตรวจสอบ env vars ตั้งแต่เริ่มต้น (ถ้าขาดจะได้ error ชัดเจน แทนที่จะใช้ placeholder แล้ว fail ลึกลับ)
    const requiredEnv: [string, string | undefined][] = [
      ['GEMINI_API_KEY', process.env.GEMINI_API_KEY],
      ['PINECONE_API_KEY', process.env.PINECONE_API_KEY],
      ['PINECONE_INDEX', process.env.PINECONE_INDEX],
    ];
    const missing = requiredEnv
      .filter(([name, value]) => !value || String(value).startsWith('YOUR_'))
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `ChatbotDocumentsService: missing environment variable(s): ${missing.join(', ')}. ` +
        `กรุณาตั้งค่าใน Railway Dashboard → Variables ก่อนใช้งานฟีเจอร์นี้`,
      );
    }

    // กำหนดค่า API Keys
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });

    // ตรวจสอบว่ามี Index ใน Pinecone ตั้งค่า Dimension = 768 (สำหรับ Gemini)
    this.pineconeIndex = this.pinecone.index(process.env.PINECONE_INDEX as string);
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

  async getAllDocuments(): Promise<ChatbotDocument[]> {
    return this.chatbotDocumentRepo.find({
      order: { uploaded_at: 'DESC' },
      relations: ['user']
    });
  }

  async uploadAndProcessDocument(file: Express.Multer.File, userId: number): Promise<ChatbotDocument> {
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('รองรับเฉพาะไฟล์ PDF เท่านั้น');
    }

    // 1. สร้าง Record ในระบบเพื่อรับ ID อ้างอิง
    const doc = this.chatbotDocumentRepo.create({
      file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'), // ป้องกันชื่อไฟล์ภาษาไทยเพี้ยน
      file_size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      uploaded_by: userId,
    });
    
    // บันทึกใส่เบสเพื่อให้ได้ doc.id มาประทับตราตอนยัดลง Pinecone
    const savedDoc = await this.chatbotDocumentRepo.save(doc);

    try {
      this.logger.log(`Parsing PDF: ${savedDoc.file_name} (ID: ${savedDoc.id})`);
      
      // 2. แกะข้อความจากไฟล์ PDF
      // จัดการเคสที่ pdf-parse อาจจะ export เป็น object แทนที่จะเป็นฟังก์ชัน
      const parseFunction = typeof pdfParse === 'function' ? pdfParse : (pdfParse.PDFParse || pdfParse.default);
      const pdfData = await parseFunction(file.buffer);
      const rawText = pdfData.text.replace(/\n/g, ' ').trim(); // ทำความสะอาดข้อความ

      if (!rawText) {
        throw new Error('ไม่พบข้อมูลข้อความในไฟล์ PDF นี้');
      }

      // 3. หั่นไฟล์ (Chunking) เพื่อกระจายเข้า Vector DB
      const chunks = this.chunkText(rawText);
      this.logger.log(`PDF parsed successfully. Separated into ${chunks.length} chunks.`);

      
      const embeddingModel = this.genAI.getGenerativeModel({ model: "text-embedding-001" });

      // 4. สร้าง Embedding ด้วย Gemini และบันทึกลง Pinecone ทีละชุด (Batches)
      const batchSize = 100; 
      for (let i = 0; i < chunks.length; i += batchSize) {
        const chunkBatch = chunks.slice(i, i + batchSize);
        
        // 4.1 ขอ Vector 768 Dimensions จาก Gemini (ใช้ batchEmbedContents)
        // จัดรูปแบบ Request ทีละตัวใน Batch
        const requests = chunkBatch.map(content => ({
            content: { role: 'user', parts: [{ text: content }] },
            outputDimensionality: 768 // ตรงกับ Pinecone Index ที่สร้างไว้ (768 dims)
        }));

        const result = await embeddingModel.batchEmbedContents({ requests });
        const embeddings = result.embeddings;

        // 4.2 แปลง embeddings เป็น vector records สำหรับ Pinecone
        const vectors = (embeddings || []).map((emb, idx) => {
          // ใช้ Array.from() เพื่อให้แน่ใจว่าเป็น plain number[] ไม่ใช่ Float32Array หรือ typed array
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

        // กรองเฉพาะ vector ที่มีค่าจริงๆ
        const validVectors = vectors.filter(v => v.values && v.values.length > 0);
        this.logger.log(`Batch ${(i / batchSize) + 1}: ${validVectors.length} valid vectors (${validVectors[0]?.values?.length ?? 0} dims each)`);

        if (validVectors.length > 0) {
          // ใช้ namespace แยกต่อเอกสาร เพื่อให้ลบได้ง่ายด้วย deleteAll()
          const ns = this.pineconeIndex.namespace(`doc-${savedDoc.id}`);
          // SDK v7.x: upsert ต้องการ { records: [...] } ไม่ใช่ array โดยตรง
          await ns.upsert({ records: validVectors });
          this.logger.log(`Upsert successful: Batch ${(i / batchSize) + 1} with ${validVectors.length} vectors into namespace doc-${savedDoc.id}`);
        } else {
          this.logger.warn(`No valid vectors found for document ${savedDoc.id} in batch ${(i / batchSize) + 1}.`);
        }
      }

      this.logger.log(`Successfully processed and vectorized document ${savedDoc.id}`);
      return savedDoc;

    } catch (error) {
      this.logger.error(`Error processing document ${savedDoc.id}:`, error);
      
      // Cleanup: หากพังกลางคัน ให้ลบ namespace ของเอกสารนี้ออกจาก Pinecone
      try {
        await this.pineconeIndex.namespace(`doc-${savedDoc.id}`).deleteAll();
      } catch (cleanupError) {
        this.logger.error(`Failed to cleanup Pinecone namespace for document ${savedDoc.id}:`, cleanupError);
      }
      
      await this.chatbotDocumentRepo.delete(savedDoc.id);

      // แสดง error จริงให้เห็น (ตัดให้สั้น เพื่อให้ debug ผ่าน Railway logs ได้ ไม่ยัดยาวเกินไปลง response)
      const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      throw new BadRequestException(
        `เกิดข้อผิดพลาดในการประมวลผล PDF และเพิ่มเข้า Pinecone: ${errorMessage}`,
      );
    }
  }

  async deleteDocument(id: number): Promise<{ success: boolean }> {
    const doc = await this.chatbotDocumentRepo.findOneBy({ id });
    if (!doc) {
      throw new NotFoundException('ไม่พบเอกสารนี้ในระบบ');
    }

    try {
      // 1. ลบทุก vector ใน namespace ของเอกสารนี้ (รองรับ Pinecone Serverless)
      await this.pineconeIndex.namespace(`doc-${id}`).deleteAll();
      this.logger.log(`Deleted all vectors in namespace doc-${id}`);
    } catch (error) {
      this.logger.error(`Error deleting Pinecone namespace for document ${id}:`, error);
    }

    // 2. ลบออกจาก PostgreSQL ของเรา
    await this.chatbotDocumentRepo.delete(id);
    return { success: true };
  }
}
