# Hospital Management System

A production-oriented Hospital Management System covering patients, doctors,
appointments, billing, and laboratory workflows.

## Status

Frontend and backend are both active and wired together: auth (Google OAuth +
JWT), patients, doctors, appointments, billing, beds, and chat run against a
real PostgreSQL database via the NestJS API.

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
└── database/
    └── api/               # Prisma schema + migrations (PostgreSQL)
```

## Roles

Admin, Doctor, Patient, Laboratory Staff.

## Roadmap

Built module by module — auth, admin, doctor, patient, appointments, billing,
laboratory, reports, notifications — with the backend following once the UI
is in place.
