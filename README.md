<div align="center">

# 🚗 Park It Easy Office

### Smart Parking Management for Modern Teams

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![SLSA 3](https://slsa.dev/images/gh-badge-level3.svg)](https://slsa.dev)

**Effortlessly manage office parking with real-time availability, smart booking, and insightful analytics.**

[Features](#-features) • [Quick Start](#-quick-start) • [Tech Stack](#-tech-stack) • [Documentation](#-documentation)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎯 Smart Booking

- **Instant Availability** — See open spots at a glance
- **Flexible Time Slots** — Morning, afternoon, or full day
- **Vehicle Support** — Cars & motorcycles (up to 4 per spot)
- **Conflict Prevention** — No double bookings, ever

</td>
<td width="50%">

### 📈 Team Analytics

- **Fairness Score** — Equitable parking distribution
- **Usage Trends** — Weekly & monthly patterns
- **Personal Stats** — Your booking frequency & preferences
- **Leaderboards** — See who books the most

</td>
</tr>
<tr>
<td width="50%">

### 🎨 Modern Experience

- **Dark Mode** — Easy on the eyes
- **Responsive Design** — Works on any device
- **Real-time Updates** — Live availability changes
- **Beautiful UI** — Built with shadcn/ui

</td>
<td width="50%">

### 🔒 Secure & Reliable

- **Email Authentication** — Secure sign-in
- **Row-Level Security** — Supabase RLS policies
- **Type Safety** — Full TypeScript + Zod
- **SLSA Level 3** — Supply chain security

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and **pnpm**
- **Supabase account** — [Sign up free](https://supabase.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/miguel11nines/park-it-easy-office.git
cd park-it-easy-office

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) 🎉

---

## 🛠 Tech Stack

| Category     | Technology                            |
| ------------ | ------------------------------------- |
| **Frontend** | React 18.3, TypeScript 5.8, Vite 7.2  |
| **Styling**  | Tailwind CSS 3.4, shadcn/ui           |
| **Backend**  | Supabase (PostgreSQL, Auth, Realtime) |
| **State**    | TanStack Query, React Hook Form       |
| **Charts**   | Recharts 3                             |
| **Dates**    | react-day-picker 9                     |
| **Testing**  | Vitest, Playwright, Testing Library   |
| **Quality**  | ESLint 9, Prettier, Husky             |
| **Validation** | Zod 4                                |

---

## 📖 Documentation

<details>
<summary><strong>🔐 Environment Variables</strong></summary>

Create a `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id
```

Get these from [Supabase Dashboard](https://app.supabase.com/) → Project Settings → API

</details>

<details>
<summary><strong>🧪 Testing</strong></summary>

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Coverage report
pnpm test:coverage
```

</details>

<details>
<summary><strong>🐳 Docker Development</strong></summary>

```bash
# Start development environment
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

</details>

<details>
<summary><strong>📁 Project Structure</strong></summary>

```
park-it-easy-office/
├── src/
│   ├── components/      # React components
│   │   └── ui/          # shadcn/ui components
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Route pages
│   ├── services/        # Business logic
│   └── lib/             # Utilities
├── supabase/
│   └── migrations/      # Database migrations
└── e2e/                 # Playwright tests
```

</details>

<details>
<summary><strong>🚀 Deployment</strong></summary>

Build for production:

```bash
pnpm build
```

Deploy the `dist/` folder to:

- **Vercel** — Connect GitHub for auto-deploy
- **Netlify** — Set publish directory to `dist`
- **GitHub Pages** — Use the provided workflow

</details>

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork → Clone → Branch
git checkout -b feature/amazing-feature

# Make changes → Test → Lint
pnpm test && pnpm lint

# Commit → Push → PR
git commit -m "Add amazing feature"
git push origin feature/amazing-feature
```

---

## 📄 License

MIT © 2026

---

<div align="center">

**[⬆ Back to Top](#-park-it-easy-office)**

Made with ❤️ for teams who value fair parking

</div>
