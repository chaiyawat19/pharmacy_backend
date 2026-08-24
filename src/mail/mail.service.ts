import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

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

    private async sendViaBrevo(to: string, subject: string, html: string) {
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
            }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.message || `Brevo API Error: ${res.statusText}`);
        }
        return await res.json();
    }

    private async sendViaResend(to: string, subject: string, html: string) {
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