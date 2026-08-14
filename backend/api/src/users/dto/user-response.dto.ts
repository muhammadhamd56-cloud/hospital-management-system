import { Exclude, Expose } from 'class-transformer';
import type { User } from '@prisma/client';
import { ClientRole, toClientRole } from '../../common/role.mapper';

/**
 * What the API ever returns for a user. Deliberately excludes `googleId` —
 * an internal identifier with no reason to leave the server.
 */
@Exclude()
export class UserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  email!: string;

  @Expose()
  firstName!: string;

  @Expose()
  lastName!: string;

  @Expose()
  picture!: string | null;

  @Expose()
  role!: ClientRole;

  @Expose()
  roleSelected!: boolean;

  @Expose()
  createdAt!: Date;

  /** Whether the account has a local password set (vs. Google-only). */
  @Expose()
  hasPassword!: boolean;

  /** False for local signups until they complete OTP verification. Always true for Google accounts. */
  @Expose()
  emailVerified!: boolean;

  /** True for admin-provisioned staff accounts until they set their own password. */
  @Expose()
  mustChangePassword!: boolean;

  constructor(user: User) {
    this.id = user.id;
    this.email = user.email;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.picture = user.picture;
    this.role = toClientRole(user.role);
    this.roleSelected = user.roleSelected;
    this.createdAt = user.createdAt;
    this.hasPassword = user.password !== null;
    this.emailVerified = user.emailVerified;
    this.mustChangePassword = user.mustChangePassword;
  }
}
