# Doctor Profile — Name & Phone Editing

## Where to find it in the app

Log in as a doctor → **Settings** (sidebar) → **Account Information** card
(top of the page) → edit **Full name** / **Phone number** → **Save changes**.

## Frontend files

| File | Role |
|---|---|
| `src/pages/settings/DoctorSettingsPage.tsx` | Editable "Account Information" form (name + phone) |
| `src/features/auth/AuthContext.tsx` | `AuthUser.phone` field, `updateProfile()` action |
| `src/features/doctorDashboard/AvailabilityToggle.tsx` | Doctor availability on/off switch |
| `src/components/layout/Sidebar.tsx` | Renders the availability toggle for doctors |
| `src/features/doctorDashboard/DoctorProfileForm.tsx` | Specialization / department / bio / experience form |
| `src/features/patientDashboard/DoctorSearch.tsx` | Patient-facing doctor directory (shows availability badge) |
| `src/components/dashboard/DoctorsOnDuty.tsx` | Admin dashboard widget (live availability) |
| `src/pages/doctors/DoctorsPage.tsx` | Admin doctor directory (real data, availability, email) |

## Backend endpoints involved

| Endpoint | Purpose |
|---|---|
| `PATCH /api/auth/me` | Update account `fullName` / `phone` (syncs linked `Doctor.fullName`) |
| `PATCH /api/doctor-portal/availability` | Doctor toggles their own availability |
| `GET /api/doctors` | Public doctor directory (used by patient search, admin page, admin dashboard widget) |
