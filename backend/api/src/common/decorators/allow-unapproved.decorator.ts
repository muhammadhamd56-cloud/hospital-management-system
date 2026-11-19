import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNAPPROVED_KEY = 'allowUnapproved';

/**
 * Lets an account that is still awaiting (or was refused) admin approval
 * reach this route. Only for the user's own account endpoints -- enough to
 * sign in, see their status and manage their profile -- never for routes
 * that expose other people's data. See JwtAuthGuard.
 */
export const AllowUnapproved = (): ReturnType<typeof SetMetadata> => SetMetadata(ALLOW_UNAPPROVED_KEY, true);
