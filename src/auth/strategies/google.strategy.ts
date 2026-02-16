import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, StrategyOptions } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const options: StrategyOptions = {
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: 'http://localhost:5000/auth/google/callback',
      scope: ['email', 'profile'],
    };
    super(options);
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    // console.log('===== GOOGLE VALIDATE HIT =====');
    // console.log('accessToken:', accessToken);
    // console.log('refreshToken:', refreshToken);
    // console.log('profile:', profile);
    // console.log('emails:', profile?.emails);
    // console.log('name:', profile?.name);
    // console.log('================================');

    if (!profile?.emails?.length) {
      throw new Error('Google account has no email');
    }

    return {
      email: profile.emails[0].value,
      first_name: profile.name?.givenName,
      last_name: profile.name?.familyName,
      provider: 'google',
    };
  }

}
