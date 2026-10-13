# Hospital Management System

A production-oriented Hospital Management System covering patients, doctors,
appointments, billing, and laboratory workflows.

## Status

Frontend and backend are both active and wired together: auth (Google OAuth +
JWT), patients, doctors, appointments, billing (incl. refunds and payment
reminders), beds, chat (with image attachments), laboratory, staff
scheduling, emergency response, and platform settings all run against a real
PostgreSQL database via the NestJS API.

## Tech Stack

**Frontend** — React 19, Vite, TypeScript, Tailwind CSS v4, React Router, React
Hook Form + Zod, React Hot Toast, Lucide React.

**Backend** — NestJS, Prisma, PostgreSQL, Passport (Google OAuth + JWT).

## Getting Started

```bash
cd frontend
npm install
npm run dev      # starts the dev server on http://localhost:5173
npm run build    # type-checks and builds for production
npx eslint .      # lint
```

```bash
cd backend/api
npm install
npm run start:dev   # starts the API on http://localhost:3000/api
```

See `backend/api/README.md` for environment variables and Prisma commands.

## Netlify Deployment

The root `netlify.toml` configures Netlify to run
`npm ci --include=dev && npm run build` from `frontend/`, then publish
`frontend/dist/`. This explicitly installs the locked frontend dependencies,
including TypeScript and Vite, before compilation, even when deployment runs
without a separate dependency installation step. The repository root is not a
deployable website and does not contain an `index.html`.

A single-page application rewrite serves `index.html` for client-side routes,
so opening or refreshing a nested URL reaches React Router instead of Netlify's
default 404 page. Existing static files are served normally.

The NestJS backend is deployed separately. Set `VITE_API_URL` in Netlify's build
environment to the backend origin (without a trailing `/api`), and configure
the backend's `CLIENT_URL` to the frontend origin. Rebuild the frontend after
changing `VITE_API_URL`; the static frontend deployment does not start NestJS.

## Project Structure

```
hospital-management-system/
├── frontend/                 # React + Vite + TypeScript frontend
│   └── src/
│       ├── components/   # ui/ (Button, Card, Input, ...) and layout/ (Sidebar, Navbar)
│       ├── layouts/       # Route-level layouts (AuthLayout, DashboardLayout)
│       ├── pages/         # Route pages (auth/, dashboard/, ...)
│       ├── routes/        # React Router configuration
│       ├── hooks/         # Reusable hooks (useTheme, ...)
│       ├── constants/     # Route paths, navigation config
│       ├── types/         # Shared TypeScript types
│       ├── utils/         # Shared utilities (cn, ...)
│       └── styles/        # Tailwind theme tokens and global styles
├── backend/
│   └── api/               # NestJS backend (Google OAuth + JWT), :3000
│       └── src/
│           ├── auth, users, patients, doctors, appointments
│           ├── billing, beds, chat, laboratory
│           ├── emergency, platform-settings, staff, staff-scheduling
│           ├── reports, notifications, announcements, doctor-portal
│           └── medical-records, assistant, audit-log
└── database/
    └── api/               # Prisma schema + migrations (PostgreSQL)
```

## Roles

- **Admin** — platform settings, staff and doctor management, reports
- **Doctor** — patient chats, appointments, doctor portal, public profile
- **Patient** — booking, billing, chat, emergency requests
- **Staff** — umbrella role for nurses, receptionists, pharmacists, lab
  technicians, and other non-doctor staff (specific job lives on
  `Staff.staffType`)
