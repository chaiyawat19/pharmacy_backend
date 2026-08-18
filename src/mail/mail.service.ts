import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', // ใช้ host แทน service จะเสถียรกว่าในบางกรณี
            port: 587,
            secure: false, // true สำหรับ 465, false สำหรับพอร์ตอื่นๆ
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        });
    }

    async sendResetPassword(email: string, link: string) {
        try {
            await this.transporter.sendMail({
                from: `"เภสัชพร้อมสอบ" <${process.env.MAIL_USER}>`, // ใส่ชื่อผู้ส่ง
                to: email,
                subject: 'ตั้งรหัสผ่านใหม่ - เภสัชพร้อมสอบ',
                html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>สวัสดีครับ,</h2>
            <p>คุณได้ทำการขอเปลี่ยนรหัสผ่านใหม่</p>
            <p>กรุณาคลิกปุ่มด้านล่างเพื่อดำเนินการต่อ (ลิงก์นี้จะมีอายุ 15 นาที):</p>
            <a href="${link}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">ตั้งรหัสผ่านใหม่</a>
            <p>หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาละทิ้งอีเมลฉบับนี้</p>
          </div>
        `,
            });
        } catch (error) {
            console.error('Mail Sending Error:', error);
            throw new InternalServerErrorException('ไม่สามารถส่งอีเมลได้ในขณะนี้');
        }
    }

    async sendOTP(email: string, otp: string) {
        try {
            await this.transporter.sendMail({
                from: `"เภสัชพร้อมสอบ" <${process.env.MAIL_USER}>`,
                to: email,
                subject: 'รหัส OTP สำหรับสมัครสมาชิก - เภสัชพร้อมสอบ',
                html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>สวัสดีครับ,</h2>
            <p>รหัส OTP สำหรับยืนยันการสมัครสมาชิก:</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="color: #ef4444;">⚠️ รหัสนี้จะหมดอายุใน 5 นาที</p>
            <p>หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาละทิ้งอีเมลฉบับนี้</p>
          </div>
        `,
            });
        } catch (error) {
            console.error('OTP Mail Sending Error:', error);
            throw new InternalServerErrorException('ไม่สามารถส่ง OTP ได้ในขณะนี้');
        }
    }
}