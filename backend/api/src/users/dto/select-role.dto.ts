import { IsIn } from 'class-validator';
import type { ClientRole } from '../../common/role.mapper';

export class SelectRoleDto {
  // 'admin' is deliberately excluded — this is a one-time self-service pick for
  // the post-signup "how will you use this?" screen; admin accounts are
  // provisioned out-of-band, never self-assigned.
  @IsIn(['doctor', 'patient'])
  role!: ClientRole;
}
