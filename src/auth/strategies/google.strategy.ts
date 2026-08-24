import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, StrategyOptions } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const backendUrl = config.get<string>('BACKEND_URL') || 'http://localhost:5000';
    const options: StrategyOptions = {
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: `${backendUrl}/auth/google/callback`,
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
    // console.log('photos:', profile?.photos);
    // console.log('================================');

    if (!profile?.emails?.length) {
      throw new Error('Google account has no email');
    }

    let firstName = profile.name?.givenName?.trim() || '';
    let lastName = profile.name?.familyName?.trim() || '';

    // If givenName is missing, attempt to parse displayName
    if (!firstName && profile.displayName) {
      const parts = profile.displayName.trim().split(/\s+/);
      firstName = parts[0] || '';
      if (parts.length > 1 && !lastName) {
        lastName = parts.slice(1).join(' ');
      }
    }

    // If firstName is still missing, fallback to email prefix
    if (!firstName && profile.emails?.[0]?.value) {
      firstName = profile.emails[0].value.split('@')[0];
    }

    return {
      email: profile.emails[0].value.toLowerCase(),
      first_name: firstName,
      last_name: lastName || '',
      profile_picture: profile.photos?.[0]?.value || null,
      provider: 'google',
    };
  }

}
