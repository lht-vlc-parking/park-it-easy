# Park It Easy Office

A modern, user-friendly parking management system for office environments, built with React, TypeScript, and Supabase.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development Environment](#development-environment)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Building for Production](#building-for-production)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## 🌟 Overview

Park It Easy Office is a comprehensive parking spot booking system designed for corporate offices. It allows employees to book parking spots (for cars or motorcycles) with flexible time slots (morning, afternoon, or full day). The system prevents double bookings and manages motorcycle capacity limits per spot.

## ✨ Features

- **User Authentication**: Secure email-based authentication with password reset functionality
- **Smart Booking System**: 
  - Book parking spots for cars or motorcycles
  - Flexible time slots: morning, afternoon, or full day
  - Automatic conflict detection
  - Motorcycle capacity management (up to 4 motorcycles per spot)
- **Real-time Updates**: Live booking status and availability
- **Statistics Dashboard**: View booking trends and parking utilization
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dark Mode Support**: Built-in theme switching
- **Error Handling**: Comprehensive error boundaries and user-friendly error messages
- **Type Safety**: Full TypeScript implementation with runtime validation using Zod

## 🛠 Tech Stack

- **Frontend Framework**: React 18.3
- **Language**: TypeScript 5.8
- **Build Tool**: Vite 7.2
- **Styling**: Tailwind CSS 3.4
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Backend**: Supabase (PostgreSQL database, Authentication, Real-time subscriptions)
- **State Management**: TanStack Query (React Query)
- **Form Handling**: React Hook Form with Zod validation
- **Routing**: React Router v6
- **Testing**: 
  - Vitest (Unit tests)
  - Playwright (E2E tests)
  - Testing Library (Component tests)
- **Linting**: ESLint 9
- **Icons**: Lucide React

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js) or **pnpm**
- **Git** - [Download](https://git-scm.com/)
- **Supabase Account** (free tier available) - [Sign up](https://supabase.com/)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/miguel11nines/park-it-easy-office.git
   cd park-it-easy-office
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Supabase credentials (see [Environment Variables](#environment-variables) section).

4. **Set up Supabase database**
   
   Run the migrations in the `supabase/migrations/` directory in your Supabase project to create the necessary tables and policies.

## 🔧 Development Environment

### Using Docker (Recommended)

A Docker Compose setup is provided for easy development environment setup:

```bash
# Start the development environment
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the environment
docker-compose down
```

### Manual Setup

If you prefer to run without Docker:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Development Tools

- **ESLint**: Linting and code quality
  ```bash
  npm run lint
  ```

- **TypeScript**: Type checking
  ```bash
  npx tsc --noEmit
  ```

- **Vite**: Hot module replacement for instant updates during development

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration
# Get these from your Supabase project settings: https://app.supabase.com/project/_/settings/api

# Your Supabase project URL (e.g., https://xxxxxxxxxxxxx.supabase.co)
VITE_SUPABASE_URL=your_supabase_project_url

# Your Supabase publishable/anon key
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Your Supabase project ID (optional, for additional features)
VITE_SUPABASE_PROJECT_ID=your_supabase_project_id
```

### Getting Supabase Credentials

1. Create a new project at [Supabase](https://app.supabase.com/)
2. Go to Project Settings → API
3. Copy the Project URL and anon/public key
4. Run the migrations from `supabase/migrations/` to set up the database schema

## 🏃 Running the Application

### Development Mode

```bash
npm run dev
```

Access the app at `http://localhost:5173`

### Development Build

```bash
npm run build:dev
npm run preview
```

### Production Build

```bash
npm run build
npm run preview
```

## 🧪 Testing

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### End-to-End Tests

```bash
# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Debug E2E tests
npm run test:e2e:debug

# View test report
npm run test:e2e:report
```

## 🔧 Maintenance Scripts

### Delete GitHub Deployments

Remove all GitHub deployments from the repository (useful for cleanup):

```bash
# Set your GitHub token
export GH_TOKEN=your_github_token

# Run the deletion script
npm run delete:deployments
```

See [scripts/README-delete-deployments.md](scripts/README-delete-deployments.md) for more details.

### Generate Favicons

Generate favicons from a source image:

```bash
npm run generate:favicons
```

## 📦 Building for Production

```bash
# Build the application
npm run build
```

The built files will be in the `dist/` directory, ready for deployment.

### Deployment

The application can be deployed to various platforms:

- **Vercel**: Connect your GitHub repository for automatic deployments
- **Netlify**: Use the `dist` folder as the publish directory
- **GitHub Pages**: Set the base URL in `vite.config.ts`
- **Traditional hosting**: Upload the `dist` folder contents

## 📁 Project Structure

```
park-it-easy-office/
├── e2e/                      # End-to-end tests (Playwright)
├── public/                   # Static assets (favicons, images, etc.)
├── scripts/                  # Utility scripts
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # Reusable UI components (shadcn/ui)
│   │   └── *.tsx           # Feature components
│   ├── hooks/              # Custom React hooks
│   ├── integrations/       # Third-party integrations (Supabase)
│   ├── lib/                # Utility functions
│   ├── pages/              # Page components (routes)
│   ├── services/           # Business logic and API services
│   ├── test/               # Unit and integration tests
│   ├── App.tsx             # Main App component
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global styles
├── supabase/
│   ├── migrations/         # Database migrations
│   └── config.toml         # Supabase configuration
├── .env.example            # Environment variables template
├── docker-compose.yml      # Docker development environment
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite build configuration
├── vitest.config.ts        # Vitest test configuration
└── playwright.config.ts    # Playwright E2E test configuration
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on:

- Code of Conduct
- Development workflow
- Coding standards
- Pull request process
- Issue reporting guidelines

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test` and `npm run test:e2e`)
5. Run linting (`npm run lint`)
6. Commit your changes (`git commit -m 'Add some amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [shadcn/ui](https://ui.shadcn.com/) for beautiful, accessible components
- Powered by [Supabase](https://supabase.com/) for backend infrastructure
- Icons from [Lucide](https://lucide.dev/)
- Bootstrapped with [Vite](https://vitejs.dev/)

## 📞 Support

If you encounter any issues or have questions:

- Open an issue on [GitHub Issues](https://github.com/miguel11nines/park-it-easy-office/issues)
- Check existing issues and discussions
- Review the documentation

## 🗺️ Roadmap

- [ ] Mobile app (React Native)
- [ ] Email notifications for bookings
- [ ] Admin dashboard for parking management
- [ ] Integration with calendar systems
- [ ] Advanced analytics and reporting
- [ ] Multi-language support

## 📝 Known Issues & TODOs

### Error Tracking
- **Error monitoring**: Implement error tracking service integration (e.g., Sentry) in the ErrorBoundary component for better production error monitoring and debugging.

### Security Enhancements
- **Rate limiting**: Implement API rate limiting to prevent abuse
- **Audit logging**: Add comprehensive audit logging for security events
- **Two-factor authentication**: Support for 2FA on user accounts
- **Session management**: Enhanced session security and timeout handling

---

Made with ❤️ by [Miguel Sanchez](mailto:miguel@11nines.com)
