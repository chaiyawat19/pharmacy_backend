import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatbotDocument } from './entities/chatbot_document.entity';
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
    // กำหนดค่า API Keys
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY');

    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || 'YOUR_PINECONE_API_KEY',
    });

    // ตรวจสอบว่ามี Index ใน Pinecone ตั้งค่า Dimension = 768 (สำหรับ Gemini) 
    this.pineconeIndex = this.pinecone.index(process.env.PINECONE_INDEX || 'YOUR_INDEX_NAME');
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

      // เลือกใช้ Model ประสิทธิภาพสูงรุ่นล่าสุด (v004) และปรับให้ Dimension ตรงกับ Pinecone Index (1024)
      const embeddingModel = this.genAI.getGenerativeModel({ model: "gemini-embedding-001" });

      // 4. สร้าง Embedding ด้วย Gemini และบันทึกลง Pinecone ทีละชุด (Batches)
      const batchSize = 100; 
      for (let i = 0; i < chunks.length; i += batchSize) {
        const chunkBatch = chunks.slice(i, i + batchSize);
        
        // 4.1 ขอ Vector 768 Dimensions จาก Gemini (ใช้ batchEmbedContents)
        // จัดรูปแบบ Request ทีละตัวใน Batch
        const requests = chunkBatch.map(content => ({
            content: { role: 'user', parts: [{ text: content }] },
            outputDimensionality: 1024 // ปรับให้ตรงกับ Pinecone Index ของคุณ!
        }));

        const result = await embeddingModel.batchEmbedContents({ requests });
        const embeddings = result.embeddings;

        // 4.2 ยัดลง Pinecone พร้อมแนบ Metadata
        const vectors = (embeddings || []).map((emb, idx) => {
          // ดึงค่า vector ออกมาให้ชัวร์ที่สุด
          let finalValues: number[] = [];
          if (Array.isArray(emb.values)) {
            finalValues = emb.values;
          } else if (emb['embedding'] && Array.isArray(emb['embedding'].values)) {
            finalValues = emb['embedding'].values;
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

        // กรองเฉพาะ vector ที่มีข้อมูลจริงๆ
        const validVectors = vectors.filter(v => v.values && v.values.length > 0);

        if (validVectors.length > 0) {
          try {
            // สำคัญมาก: ทดสอบแล้วว่าใน SDK v7.1.0 การระบุ namespace('') เป็นสิ่งจำเป็นสำหรับ Serverless Index
            // และจำนวน Dimension ต้องตรงกัน (1024)
            await this.pineconeIndex.namespace('').upsert(validVectors);
            this.logger.log(`Upsert successful: Batch ${(i / batchSize) + 1} with ${validVectors.length} vectors (1024 dims)`);
          } catch (upsertError) {
            this.logger.error(`Upsert failed still: ${upsertError.message}`);
            // Fallback: ลองจัดระเบียบข้อมูลใหม่เผื่อมีอะไรแปลกปลอม
            try {
              const cleanVectors = JSON.parse(JSON.stringify(validVectors));
              await this.pineconeIndex.namespace('').upsert(cleanVectors);
              this.logger.log(`Upsert successful after JSON sterilization for document ${savedDoc.id}`);
            } catch (retryError) {
              this.logger.error(`Final attempt failed. Sample vector values count: ${validVectors[0].values.length}`);
              throw retryError;
            }
          }
        } else {
          this.logger.warn(`No valid vectors (with values) found for document ${savedDoc.id} in this batch.`);
        }
      }

      this.logger.log(`Successfully processed and vectorized document ${savedDoc.id}`);
      return savedDoc;

    } catch (error) {
      this.logger.error(`Error processing document ${savedDoc.id}:`, error);
      
      // Cleanup: หากพังกลางคัน ให้ลบ record ใน DB และลบ vector ที่อาจจะหลุดเข้าไปใน Pinecone แล้วทิ้ง
      try {
        await this.pineconeIndex.namespace('').deleteMany({
          filter: { document_id: { $eq: savedDoc.id } }
        });
      } catch (cleanupError) {
        this.logger.error(`Failed to cleanup Pinecone for document ${savedDoc.id}:`, cleanupError);
      }
      
      await this.chatbotDocumentRepo.delete(savedDoc.id);
      throw new BadRequestException('เกิดข้อผิดพลาดในการประมวลผล PDF และเพิ่มเข้า Pinecone');
    }
  }

  async deleteDocument(id: number): Promise<{ success: boolean }> {
    const doc = await this.chatbotDocumentRepo.findOneBy({ id });
    if (!doc) {
      throw new NotFoundException('ไม่พบเอกสารนี้ในระบบ');
    }

    try {
      // 1. ลบจาก Pinecone ผ่านตัวกรองเงื่อนไข (Metadata Filter)
      await this.pineconeIndex.namespace('').deleteMany({
        filter: { document_id: { $eq: id } }
      });
      this.logger.log(`Deleted all vectors for document_id: ${id}`);
    } catch (error) {
      this.logger.error(`Error deleting vectors for document ${id}:`, error);
    }

    // 2. ลบออกจาก PostgreSQL ของเรา
    await this.chatbotDocumentRepo.delete(id);
    return { success: true };
  }
}
