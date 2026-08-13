import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import type { GoogleProfilePayload } from '../types/google-profile.interface';
import { normalizeEmail } from '../../common/normalize-email';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('google.clientId'),
      clientSecret: configService.get<string>('google.clientSecret'),
      callbackURL: configService.get<string>('google.callbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const rawEmail = profile.emails?.[0]?.value;

    if (!rawEmail) {
      done(new Error('Google account has no verifiable email address'), false);
      return;
    }

    const payload: GoogleProfilePayload = {
      googleId: profile.id,
      email: normalizeEmail(rawEmail),
      firstName: profile.name?.givenName ?? profile.displayName ?? 'Unknown',
      lastName: profile.name?.familyName ?? '',
      picture: profile.photos?.[0]?.value,
    };

    done(null, payload);
  }
}
