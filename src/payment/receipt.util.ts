import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

export type ReceiptData = {
  receiptNo: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  method: string;
  transactionRef: string | null;
  paidAt: Date;
  expiresAt: Date | null;
};

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function thaiDate(date: Date): string {
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

/**
 * หาไฟล์ฟอนต์ — รันจาก dist ตอน runtime แต่ fallback ไป src เผื่อ assets ยังไม่ถูกคัดลอก
 * (ฟอนต์ default ของ pdfkit ไม่รองรับภาษาไทย จึงต้องฝัง Kanit มาด้วย)
 */
function resolveFont(filename: string): string | null {
  const candidates = [
    path.join(__dirname, 'assets', filename),
    path.join(process.cwd(), 'src', 'payment', 'assets', filename),
    path.join(process.cwd(), 'dist', 'payment', 'assets', filename),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function resolveReceiptAsset(filename: string): string | null {
  const candidates = [
    path.join(__dirname, 'assets', filename),
    path.join(process.cwd(), 'src', 'payment', 'assets', filename),
    path.join(process.cwd(), 'dist', 'payment', 'assets', filename),
    path.join(process.cwd(), '..', 'pharmacyexam_Frontend', 'public', 'img', filename),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function buildReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const regular = resolveFont('Kanit-Regular.ttf');
      const medium = resolveFont('Kanit-Medium.ttf');
      const logoPath = resolveReceiptAsset('logoPhama.png');
      const bodyFont = regular ?? 'Helvetica';
      const headFont = medium ?? regular ?? 'Helvetica-Bold';

      // ── หัวใบเสร็จ ──
      if (logoPath) {
        doc.image(logoPath, 50, 44, { fit: [50, 50] });
      }

      doc.font(headFont).fontSize(22).fillColor('#1f2937')
        .text('ใบเสร็จรับเงิน', { align: 'center' });
      doc.font(bodyFont).fontSize(11).fillColor('#6b7280')
        .text('เภสัชพร้อมสอบ — ระบบเตรียมสอบใบประกอบวิชาชีพเภสัชกรรม', { align: 'center' });
      doc.moveDown(0.3);
      doc.font(bodyFont).fontSize(10).fillColor('#9ca3af')
        .text('วิทยาลัยการคอมพิวเตอร์ มหาวิทยาลัยขอนแก่น', { align: 'center' });

      doc.moveDown(1.2);
      doc.strokeColor('#e5e7eb').lineWidth(1)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1.2);

      // ── รายละเอียด ──
      const row = (label: string, value: string) => {
        const y = doc.y;
        doc.font(bodyFont).fontSize(11).fillColor('#6b7280').text(label, 60, y, { width: 180 });
        doc.font(headFont).fontSize(11).fillColor('#111827').text(value, 240, y, { width: 305 });
        doc.moveDown(0.7);
      };

      row('เลขที่ใบเสร็จ', data.receiptNo);
      row('วันที่ชำระเงิน', thaiDate(data.paidAt));
      row('ชื่อผู้ชำระเงิน', data.customerName);
      row('อีเมล', data.customerEmail);
      row('ช่องทางการชำระเงิน', data.method);
      if (data.transactionRef) {
        row('รหัสอ้างอิงธุรกรรม', data.transactionRef);
      }

      doc.moveDown(0.5);
      doc.strokeColor('#e5e7eb').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // ── รายการ ──
      doc.font(headFont).fontSize(12).fillColor('#111827').text('รายการ', 60);
      doc.moveDown(0.5);
      doc.font(bodyFont).fontSize(11).fillColor('#374151')
        .text('สิทธิ์ผู้ดูแลระบบ (รายปี)', 60, doc.y, { width: 300, continued: false });
      doc.moveUp();
      doc.font(headFont).fontSize(11).fillColor('#111827')
        .text(`${data.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`, 360, doc.y, {
          width: 185, align: 'right',
        });

      if (data.expiresAt) {
        doc.moveDown(0.4);
        doc.font(bodyFont).fontSize(10).fillColor('#6b7280')
          .text(`ระยะเวลาใช้งานถึงวันที่ ${thaiDate(data.expiresAt)}`, 60, doc.y);
      }

      doc.moveDown(1);
      doc.strokeColor('#e5e7eb').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.8);

      // ── ยอดรวม ──
      const totalY = doc.y;
      doc.font(headFont).fontSize(13).fillColor('#111827').text('ยอดชำระทั้งสิ้น', 60, totalY);
      doc.font(headFont).fontSize(15).fillColor('#4f46e5')
        .text(`${data.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`, 360, totalY, {
          width: 185, align: 'right',
        });

      doc.moveDown(3);
      doc.font(bodyFont).fontSize(9).fillColor('#9ca3af')
        .text('เอกสารนี้ออกโดยระบบอัตโนมัติ ใช้เป็นหลักฐานการชำระเงินได้โดยไม่ต้องมีลายเซ็น', 50, doc.y, {
          align: 'center', width: 495,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
