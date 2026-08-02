# Hospital Management System

A production-oriented Hospital Management System covering patients, doctors,
appointments, billing, laboratory, and pharmacy workflows.

## Status

Frontend scaffolding in progress. The backend (Express + Prisma + PostgreSQL) has
not been started yet — current work is UI-only, built against mock/placeholder data.

## Tech Stack

**Client** — React 19, Vite, TypeScript, Tailwind CSS v4, React Router, React Hook
Form + Zod, React Hot Toast, Lucide React.

## Getting Started

```bash
cd client
npm install
npm run dev      # starts the dev server on http://localhost:5173
npm run build    # type-checks and builds for production
npx eslint .      # lint
```

## Project Structure

```
hospital-management-system/
├── client/           # React + Vite + TypeScript frontend
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
├── docs/             # Documentation (added as modules are built)
└── database/         # Database schema and seed data (added with the backend)
```

## Roles

Admin, Doctor, Receptionist, Patient, Laboratory Staff, Pharmacist.

## Roadmap

Built module by module — auth, admin, doctor, patient, appointments, billing,
laboratory, pharmacy, reports, notifications — with the backend following once
the UI is in place.
