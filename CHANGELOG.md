# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### To Add

- Push notifications for booking reminders
- Export statistics to CSV/PDF
- Integration with external calendars (Google Calendar, Outlook)
- Admin panel for space management

---

## [2.3.3] - 2026-02-04

### Dependencies

- Updated lodash from 4.17.21 to 4.17.23
- Updated globals from 15.15.0 to 17.0.0
- Updated recharts from 2.15.4 to 3.6.0
- Updated react-day-picker from 8.10.1 to 9.13.0
- Updated typescript-eslint from 8.51.0 to 8.53.0
- Updated zod from 3.25.76 to 4.3.5

## [2.3.2] - 2026-01-12

### Security

- Fixed SECURITY DEFINER views (booking_fairness, active_parking_spots, daily_occupancy_stats, weekly_booking_trends, user_booking_stats, waitlist_with_users, spot_popularity) to use SECURITY INVOKER for proper RLS enforcement
- Removed direct API access to booking_summary_mv materialized view
- Added secure get_booking_summary() function wrapper for authenticated access only

### Fixed

- Fixed idempotency issue in booking policies migration

---

## [2.3.1] - 2026-01-05

### Dependencies

- Updated prettier-plugin-tailwindcss from 0.6.14 to 0.7.2
- Updated lucide-react from 0.554.0 to 0.562.0
- Updated sonner from 1.7.4 to 2.0.7
- Updated react-router-dom from 6.30.2 to 7.11.0
- Updated tailwind-merge from 2.6.0 to 3.4.0

---

## [2.3.0] - 2026-01-05

### Changed

- Repositioned duration badge (All Day/AM/PM) and Cancel button to top right of booking cards
- Improved layout of ParkingSpotCard booking items with badge at top right

### Fixed

- Fixed calendar date bug in Statistics page where bookings appeared on wrong day due to UTC timezone conversion
- Now using local timezone for date calculations to ensure correct day display

---

## [2.2.0] - 2026-01-04

### Added

- Booking creation timestamp display in All Upcoming Bookings section
- Shows when each booking was created with date and time
- Improved transparency and visibility of booking history for team-wide collaboration

### Changed

- Enhanced booking card UI to include creation metadata
- Better visual organization of booking information

---

## [2.1.1] - 2026-01-04

### Fixed

- Performance optimization in statistics dashboard
- Minor bug fixes in form validation
- Improved user experience on mobile devices

---

## [2.1.0] - 2026-01-03

### Added

- Enhanced statistics dashboard with meaningful metrics
- Optimized database views for statistics queries
- Fairness and distribution metrics for bookings
- Demand and availability analysis with heat maps
- Personal user statistics
- Trend indicators and predictions
- Monthly capacity utilization charts
- Most active users leaderboard

### Changed

- Complete refactoring of statistics component
- Database query optimization
- Dashboard UI improvements

---

## [2.0.0] - 2026-01-03

### Added

- **User Profile System** (`user_profiles`)
  - Extended profiles with additional information
  - Default department and vehicle preferences
  - Customized notification settings
  - Avatars and display names

- **Booking Audit System** (`booking_audit`)
  - Complete logging of all booking operations
  - Tracking of creations, cancellations, and modifications
  - Change history with old and new data
  - IP and user agent capture for security

- **Recurring Bookings** (`recurring_bookings`)
  - Automatic weekly booking pattern
  - Configurable weekdays
  - Customizable start and end dates
  - Automatic generation of future bookings

- **Waitlist System** (`booking_waitlist`)
  - Queue for fully booked spaces
  - Automatic availability notifications
  - Queue positioning system
  - Waitlist states: waiting, notified, expired, fulfilled

- **Database Statistics Views**
  - `user_booking_stats`: Per-user statistics
  - `spot_utilization_stats`: Per-space utilization
  - `daily_booking_stats`: Aggregated daily statistics
  - `peak_hours_analysis`: Peak hours analysis

- **Custom Hooks**
  - `useBookingAudit`: Audit history management
  - `useRecurringBookings`: Recurring bookings handling
  - `useUserProfile`: User profile management
  - `useWaitlist`: Waitlist system
  - `useStatistics`: Enhanced statistics from DB views
  - `useParkingSpots`: Parking space management

- **Dark Mode**
  - Complete dark theme implementation
  - `ThemeToggle` component on all pages
  - Theme preference persistence
  - System preference support

### Changed

- Migration to V2 architecture with database improvements
- Service layer refactoring
- Security improvements with updated RLS policies
- Database index optimization for better performance

### Security

- Fixed security issues in RLS policies
- Implementation of `search_path` validation in functions
- Removal of legacy `durations_overlap` functions
- Improved SQL injection protection
- Enhanced user permission validation

---

## [1.0.0] - 2025-10-10

### Added

- **Initial Launch of Park It Easy Office**
- Complete parking booking system for office environments
- Support for cars and motorcycles with capacity management
  - Capacity of 4 motorcycles per space
  - Automatic capacity validation
- Flexible time slots: morning, afternoon, or full day
- Real-time booking status and availability
- Statistics dashboard for parking utilization
- Responsive design with Tailwind CSS
- Type-safe implementation using TypeScript 5.8
- Validation with Zod schemas
- Complete test suite (65 tests passing)
- Development environment with Docker Compose
- End-to-end testing with Playwright
- Complete documentation:
  - README.md with installation instructions
  - CONTRIBUTING.md with contribution guidelines
  - CODE_OF_CONDUCT.md
  - SECURITY.md with security policy
- Secure authentication with Supabase Auth
- Email domain restriction (@bsmart.com.py)

### Technical Details

- **Frontend**: React 18.3 with TypeScript 5.8
- **Build Tool**: Vite 7.2
- **Styling**: Tailwind CSS 3.4 with shadcn/ui components
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **State Management**: TanStack Query (React Query)
- **Testing**: Vitest + Playwright + Testing Library
- **Linting**: ESLint 9 with strict rules
- **Validation**: Zod for data schemas

### Security

- Row Level Security (RLS) policies implemented
- Protection against SQL injection attacks
- Input validation on client and server
- Secure user session handling
- Access restriction by corporate email domain

---

## Types of Changes

- `Added` for new features
- `Changed` for changes in existing functionality
- `Deprecated` for soon-to-be removed features
- `Removed` for now removed features
- `Fixed` for bug fixes
- `Security` in case of vulnerabilities

---

## Contributing to the Changelog

When contributing to this project, please update the changelog with your changes in the [Unreleased] section. Follow the indicated format and categorize your changes appropriately.

For more information on how to contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

_Changelog format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)_
