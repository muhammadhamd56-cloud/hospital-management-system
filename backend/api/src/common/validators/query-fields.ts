import { applyDecorators } from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Every primary key in the schema is a Prisma `cuid()` (25 lowercase
 * alphanumerics). The pattern is deliberately a little wider than cuid --
 * any short URL-safe token -- so a future id format (cuid2, uuid) doesn't
 * start 400-ing list filters, while still rejecting junk and oversized input.
 */
export const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Department names are free text in the schema; this only caps runaway input. */
export const MAX_DEPARTMENT_NAME_LENGTH = 200;

/** Optional query-string entity id (cuid-shaped token). */
export function OptionalEntityId(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    IsString(),
    Matches(ENTITY_ID_PATTERN, { message: ({ property }) => `${property} must be a valid id` }),
  );
}

/**
 * Optional query-string date. Services pass the raw string straight to
 * `new Date(...)`, so this keeps the same accepted inputs (a calendar date
 * like `2026-11-18` or a full ISO-8601 timestamp) and rejects anything
 * `new Date` would turn into an Invalid Date (which used to surface as a 500).
 */
export function OptionalQueryDate(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    IsISO8601({ strict: true }, { message: ({ property }) => `${property} must be an ISO-8601 date` }),
  );
}

/** Optional department-name filter. */
export function OptionalDepartmentName(): PropertyDecorator {
  return applyDecorators(IsOptional(), IsString(), MaxLength(MAX_DEPARTMENT_NAME_LENGTH));
}
