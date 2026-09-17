import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { getFrontendUrl } from '../common/frontend-url';

/** ไฟล์แนบอีเมล เช่น ใบเสร็จ PDF */
export type MailAttachment = {
    filename: string;
    content: Buffer;
};

@Injectable()
export class MailService {
    private getTransporter() {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS?.replace(/\s+/g, ''),
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
        });
    }

    private async sendViaBrevo(to: string, subject: string, html: string, attachment?: MailAttachment) {
        const apiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.MAIL_USER || 'suthinantong123@gmail.com';
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': apiKey!,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sender: { name: 'เภสัชพร้อมสอบ', email: senderEmail },
                to: [{ email: to }],
                subject,
                htmlContent: html,
                ...(attachment && {
                    attachment: [
                        { name: attachment.filename, content: attachment.content.toString('base64') },
                    ],
                }),
            }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.message || `Brevo API Error: ${res.statusText}`);
        }
        return await res.json();
    }

    private async sendViaResend(to: string, subject: string, html: string, attachment?: MailAttachment) {
        const apiKey = process.env.RESEND_API_KEY;
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'เภสัชพร้อมสอบ <onboarding@resend.dev>',
                to: [to],
                subject,
                html,
                ...(attachment && {
                    attachments: [
                        { filename: attachment.filename, content: attachment.content.toString('base64') },
                    ],
                }),
            }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.message || `Resend API Error: ${res.statusText}`);
        }
        return await res.json();
    }

    async sendResetPassword(email: string, link: string) {
        const subject = 'ตั้งรหัสผ่านใหม่ - เภสัชพร้อมสอบ';
        const html = `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>สวัสดีครับ,</h2>
            <p>คุณได้ทำการขอเปลี่ยนรหัสผ่านใหม่</p>
            <p>กรุณาคลิกปุ่มด้านล่างเพื่อดำเนินการต่อ (ลิงก์นี้จะมีอายุ 15 นาที):</p>
            <a href="${link}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">ตั้งรหัสผ่านใหม่</a>
            <p>หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาละทิ้งอีเมลฉบับนี้</p>
          </div>
        `;

        try {
            if (process.env.BREVO_API_KEY) {
                await this.sendViaBrevo(email, subject, html);
            } else if (process.env.RESEND_API_KEY) {
                await this.sendViaResend(email, subject, html);
            } else {
                const transporter = this.getTransporter();
                await transporter.sendMail({
                    from: `"เภสัชพร้อมสอบ" <${process.env.MAIL_USER}>`,
                    to: email,
                    subject,
                    html,
                });
            }
        } catch (error) {
            console.error('Mail Sending Error:', error);
            throw new InternalServerErrorException('ไม่สามารถส่งอีเมลได้ในขณะนี้: ' + (error?.message || ''));
        }
    }

    /** ส่งอีเมลผ่านช่องทางที่ตั้งค่าไว้ (Brevo → Resend → SMTP ตามลำดับ) แนบไฟล์ได้ */
    private async dispatch(to: string, subject: string, html: string, attachment?: MailAttachment) {
        if (process.env.BREVO_API_KEY) {
            await this.sendViaBrevo(to, subject, html, attachment);
        } else if (process.env.RESEND_API_KEY) {
            await this.sendViaResend(to, subject, html, attachment);
        } else {
            const transporter = this.getTransporter();
            await transporter.sendMail({
                from: `"เภสัชพร้อมสอบ" <${process.env.MAIL_USER}>`,
                to,
                subject,
                html,
                ...(attachment && {
                    attachments: [
                        { filename: attachment.filename, content: attachment.content },
                    ],
                }),
            });
        }
    }

    /** เตือนล่วงหน้าก่อนสิทธิ์ผู้ดูแลระบบหมดอายุ (เรียกจาก cron รายวันใน PaymentService) */
    async sendSubscriptionExpiryReminder(email: string, expiresAt: Date, daysLeft: number) {
        const subject = `สิทธิ์ผู้ดูแลระบบจะหมดอายุในอีก ${daysLeft} วัน - เภสัชพร้อมสอบ`;
        const expiresText = expiresAt.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        const frontendUrl = getFrontendUrl();
        const html = `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>สวัสดีครับ,</h2>
            <p>สิทธิ์ผู้ดูแลระบบของคุณจะหมดอายุในอีก <strong>${daysLeft} วัน</strong> (วันที่ ${expiresText})</p>
            <p>ต่ออายุได้ที่หน้าอัปเกรดสิทธิ์เพื่อใช้งานต่อเนื่อง</p>
            <a href="${frontendUrl}/upgrade-admin" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">ต่ออายุสิทธิ์</a>
          </div>
        `;

        try {
            await this.dispatch(email, subject, html);
        } catch (error) {
            console.error('Expiry Reminder Mail Error:', error);
            throw new InternalServerErrorException('ไม่สามารถส่งอีเมลแจ้งเตือนได้ในขณะนี้: ' + (error?.message || ''));
        }
    }

    /** ยืนยันการชำระเงิน — แนบใบเสร็จ PDF ไปด้วยถ้าสร้างสำเร็จ */
    async sendPaymentConfirmation(email: string, expiresAt: Date, receipt?: MailAttachment) {
        const subject = 'ชำระเงินสำเร็จ - สิทธิ์ผู้ดูแลระบบ - เภสัชพร้อมสอบ';
        const expiresText = expiresAt.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        const html = `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>สวัสดีครับ,</h2>
            <p>การชำระเงินของคุณสำเร็จแล้ว คุณได้รับสิทธิ์ผู้ดูแลระบบเรียบร้อย</p>
            <p>สิทธิ์นี้จะหมดอายุวันที่ <strong>${expiresText}</strong></p>
            <p>เข้าใช้งานได้ทันทีที่หน้าผู้ดูแลระบบของเว็บไซต์</p>
            ${receipt ? '<p style="color:#6b7280;font-size:14px;">แนบใบเสร็จรับเงินมาพร้อมอีเมลฉบับนี้แล้ว</p>' : ''}
          </div>
        `;

        try {
            await this.dispatch(email, subject, html, receipt);
        } catch (error) {
            console.error('Payment Confirmation Mail Error:', error);
            throw new InternalServerErrorException('ไม่สามารถส่งอีเมลยืนยันได้ในขณะนี้: ' + (error?.message || ''));
        }
    }

    async sendOTP(email: string, otp: string) {
        const subject = 'รหัส OTP สำหรับสมัครสมาชิก - เภสัชพร้อมสอบ';
        const html = `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>สวัสดีครับ,</h2>
            <p>รหัส OTP สำหรับยืนยันการสมัครสมาชิก:</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="color: #ef4444;">⚠️ รหัสนี้จะหมดอายุใน 5 นาที</p>
            <p>หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาละทิ้งอีเมลฉบับนี้</p>
          </div>
        `;

        try {
            if (process.env.BREVO_API_KEY) {
                await this.sendViaBrevo(email, subject, html);
            } else if (process.env.RESEND_API_KEY) {
                await this.sendViaResend(email, subject, html);
            } else {
                const transporter = this.getTransporter();
                await transporter.sendMail({
                    from: `"เภสัชพร้อมสอบ" <${process.env.MAIL_USER}>`,
                    to: email,
                    subject,
                    html,
                });
            }
        } catch (error) {
            console.error('OTP Mail Sending Error:', error);
            throw new InternalServerErrorException('ไม่สามารถส่ง OTP ได้ในขณะนี้: ' + (error?.message || ''));
        }
    }
}