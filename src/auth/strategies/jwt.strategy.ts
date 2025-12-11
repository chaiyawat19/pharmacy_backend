import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => {
          return request?.cookies?.access_token;
        }
      ]),
      secretOrKey: configService.get('JWT_SECRET')!,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    return {
      user_id: payload.sub,
      email: payload.email,
      role_id: payload.role_id,
    };
  }
}
