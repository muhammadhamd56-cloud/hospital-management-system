# Hospital Management System — NestJS Backend

Google OAuth 2.0 + JWT backend for the HMS frontend (`frontend/`). Stateless —
no sessions, no cookies. Every protected request carries `Authorization:
Bearer <jwt>`.

This lives alongside the original Express backend (`backend/legacy-express/`),
which is untouched and still has the fuller feature set (doctors directory,
appointments, chat). The frontend now points at **this** backend for auth;
those other features are not yet ported here — see "What's not built yet"
below.

Prisma schema and migrations live in `database/api/` (see `../../database/api/`),
not in this folder — the npm scripts below already point `prisma` at it via
`--schema`.

## Stack

NestJS · PostgreSQL · Prisma · Passport (Google OAuth2 + JWT) · class-validator

## Setup

```bash
cd backend/api
npm install
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — a real PostgreSQL connection string.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
  (see below).
- `GOOGLE_CALLBACK_URL` — must exactly match an "Authorized redirect URI" in
  Google Cloud Console. Defaults to `http://localhost:3000/api/auth/google/callback`.
- `JWT_SECRET` — any long random string for local dev.

Then:

```bash
npm run prisma:migrate -- --name init   # creates the User table
npm run start:dev                       # http://localhost:3000/api
```

### Google Cloud Console setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs &
   Services → Credentials.
2. Create an OAuth 2.0 Client ID (type: Web application).
3. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
   (or whatever `GOOGLE_CALLBACK_URL` is set to).
4. Copy the generated Client ID / Client Secret into `.env`.

### Running alongside the frontend

`frontend/vite.config.ts` proxies `/api` to `http://localhost:3000`. Start this
backend, then `npm run dev` in `frontend/` as usual — the "Continue with
Google" button on the login page drives the whole flow.

## Auth flow

```
Browser → GET /api/auth/google
        → 302 to Google's consent screen
        → user approves
        → Google redirects to GOOGLE_CALLBACK_URL
        → GoogleStrategy.validate() extracts profile
        → AuthService.validateGoogleUser() finds-or-creates the User (default role: PATIENT)
        → JWT issued (sub, email, role)
        → 302 to {CLIENT_URL}/oauth/callback?token=<jwt>
        → frontend stores the token and calls GET /api/users/me
```

There is currently no UI/endpoint to promote a user's role away from the
`PATIENT` default — do it directly in the DB (`npm run prisma:studio`) until an
admin-management endpoint exists.

## API

All responses are wrapped consistently:

```json
// success
{ "success": true, "message": "Request successful", "data": { ... } }

// error
{ "success": false, "message": "...", "errors": ["..."] }
```

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/google` | Public | Redirects to Google's consent screen |
| GET | `/api/auth/google/callback` | Public | Google's redirect target; issues JWT, redirects to frontend |
| GET | `/api/users/me` | Bearer JWT | Current user's profile |
| GET | `/api/patients` | Bearer JWT (ADMIN, DOCTOR) | Placeholder — 501 Not Implemented |
| POST | `/api/patients` | Bearer JWT (ADMIN) | Placeholder — 501 Not Implemented |
| GET | `/api/doctors` | Bearer JWT | Public doctor directory (search by `q`/`department`, `limit`) |
| GET | `/api/doctor-portal/profile` | Bearer JWT (DOCTOR) | The logged-in doctor's own profile, or `null` if not set yet |
| PUT | `/api/doctor-portal/profile` | Bearer JWT (DOCTOR) | Create/update the logged-in doctor's profile |
| PATCH | `/api/doctor-portal/availability` | Bearer JWT (DOCTOR) | Toggle `isAvailable` |
| GET | `/api/doctor-portal/appointments` | Bearer JWT (DOCTOR) | The logged-in doctor's appointments |
| PATCH | `/api/doctor-portal/appointments/:id/cancel` | Bearer JWT (DOCTOR) | Cancel a scheduled appointment |
| PATCH | `/api/doctor-portal/appointments/:id/complete` | Bearer JWT (DOCTOR) | Mark a scheduled appointment complete |
| GET | `/api/doctor-portal/chat` | Bearer JWT (DOCTOR) | Inbox — patients with an appointment or message thread |
| GET | `/api/doctor-portal/chat/:patientId` | Bearer JWT (DOCTOR) | Message thread with one patient |
| POST | `/api/doctor-portal/chat/:patientId` | Bearer JWT (DOCTOR) | Reply to a patient |
| GET | `/api/appointments/me` | Bearer JWT (PATIENT) | The logged-in patient's appointments |
| POST | `/api/appointments` | Bearer JWT (PATIENT) | Book an appointment with a doctor |
| PATCH | `/api/appointments/:id/cancel` | Bearer JWT (PATIENT) | Cancel one of the patient's own appointments |
| GET | `/api/chat/:doctorId` | Bearer JWT (PATIENT) | Message thread with one doctor |
| POST | `/api/chat/:doctorId` | Bearer JWT (PATIENT) | Message a doctor (requires an existing appointment/thread) |

`GET /api/users/me` response `data`:

```json
{
  "id": "clx...",
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "picture": "https://lh3.googleusercontent.com/...",
  "role": "patient",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

`role` is lowercase (`admin` | `doctor` | `patient`) at the API boundary —
matching the frontend's `AuthRole` type — even though the Postgres enum
(`Role`) is uppercase internally. See `src/common/role.mapper.ts`.

Import `postman_collection.json` into Postman for ready-to-run requests
(open `GET /auth/google` in a real browser tab first — Postman can't
complete an interactive Google consent screen — then paste the resulting
token into the collection's `token` variable for the protected requests).

## Project structure

```
src/
  auth/            Google OAuth strategy, JWT strategy, guards, AuthService
  users/           GET /users/me
  patients/        Placeholder module (spec'd, not implemented)
  doctors/         Public doctor directory (search/filter)
  doctor-portal/   Doctor self-service: profile, availability, their
                   appointments, their inbox — mirrors legacy-express's
                   doctorPortal module
  appointments/    Patient-side booking (list/book/cancel)
  chat/            Patient-side messaging with a doctor
  prisma/          PrismaService/PrismaModule (global)
  common/          @Roles()/@CurrentUser() decorators, RolesGuard,
                   global exception filter, global response interceptor,
                   role.mapper (Prisma Role <-> frontend AuthRole),
                   session.mapper (Appointment/Chat enum <-> frontend shape)
  config/          typed configuration() + env.validation() (fails fast on
                   missing/invalid env vars at boot)
```

## Role-based authorization

```ts
@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  @Get()
  @Roles(Role.ADMIN, Role.DOCTOR)
  findAll() { ... }
}
```

`JwtAuthGuard` authenticates (populates `request.user`); `RolesGuard` reads
`@Roles(...)` metadata and checks it against `request.user.role`. Use
`@CurrentUser()` in a handler to get the authenticated user directly.

## What's not built yet

Doctors directory, doctor-portal, appointments, and chat are now ported over
(see the endpoint table above) — `Doctor.rating`/`acceptsOnline`/`isAvailable`
plus the `Appointment` and `ChatMessage` models were added to
`database/api/schema.prisma` to support them. Note one behavior difference
from `backend/legacy-express`: every `Doctor` row here always has a real
linked `User` (created at signup), so there's no "seeded doctor with no
account" case — the auto-generated bot reply that legacy's chat module sent
on a patient's first message doesn't apply; a real doctor account must reply.

Still missing:

- Account profile editing (name/phone), account deletion
- Real `/patients` (admin) — still a 501 placeholder

Porting these means: adding their Prisma models to `schema.prisma` (they're
already designed in `database/legacy-express/schema.prisma` — `Doctor`,
`Appointment`, `ChatMessage`), then a NestJS module per resource following
the same controller → service → Prisma pattern used here.
