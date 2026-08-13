import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protects a route with the JWT bearer strategy. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
