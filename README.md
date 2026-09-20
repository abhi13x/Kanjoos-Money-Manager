# Money Manager (Kanjoos)

A privacy-focused, client-side personal finance manager built with React, TypeScript, and Dexie.js. This application allows users to track accounts, categories, and transactions with local-first storage and optional Google Drive synchronization.

## 🚀 Features

- **Local-First Storage**: Uses Dexie.js (IndexedDB) for fast, offline-capable data management.
- **Account Management**: Support for various account types (Cash, Savings, Wallet, Credit Cards, Mutual Funds, Stocks, etc.).
- **Transaction Tracking**: Easy logging of income, expenses, and transfers between accounts.
- **Category System**: Hierarchical categories for detailed spending analysis.
- **Google Drive Sync**: Secure, client-side backup and restore using the Google Drive `appDataFolder` scope, ensuring data privacy.
- **Modern UI**: Built with React 19, Tailwind CSS, and Material UI for a responsive and clean user experience.
- **Financial Precision**: All monetary values are stored as integers (cents/paise) to avoid floating-point precision errors.

## 📂 Project Structure

```text
money-manager/
├── public/              # Static assets
├── src/
│   ├── assets/           # Images and static icons
│   ├── components/     # UI Components (Tabs, Modals, Dashboard)
│   │   ├── AccountsTab/        # Account management view & logic
│   │   ├── CategoriesTab/      # Category management view & logic
│   │   ├── StatsTab/           # Financial statistics and charts
│   │   ├── TransactionTab/    # Transaction history and management
│   │   ├── TransactionModal/   # Add/Edit transaction dialog
│   │   ├── Dashboard.tsx       # Main overview and summary
│   │   ├── DriveSyncSettings.tsx # Sync configuration settings
│   │   ├── SettingsTab.tsx     # App settings
│   │   ├── SummaryTab.tsx      # Transaction summaries
│   │   ├── TabMenu.tsx         # Navigation between views
│   │   └── IosSafeAreaLayoutContainer.tsx # Layout wrapper for iOS devices
│   ├── db/
│   │   └── schema.ts           # Dexie database definition and seeding
│   ├── hooks/                  # Custom React hooks for state and logic
│   │   ├── useSettings.ts      # User preference management
│   │   ├── useUserSummary.ts    # Aggregated financial data hooks
│   │   ├── useGDriveSession.ts  # Google Drive session management
│   │   └── useWindowSize.ts     # Window dimension tracking
│   ├── services/              # Business logic and external API integrations
│   │   ├── financeService.ts    # Business logic for transactions and balances
│   │   ├── gdriveSync.ts       # Google Drive API integration for backups
│   │   ├── investmentFormulas.ts # Investment calculation logic
│   │   ├── investmentService.ts # Investment tracking and calculations
│   │   ├── themeService.ts      # Theme management logic
│   │   └── gdrive/             # Detailed Google Drive API utilities
│   ├── theme/                  # Custom theme definitions
│   │   └── glass.tsx            # Glassmorphism theme implementation
│   ├── types/
│   │   ├── finance.ts           # Domain types and currency utilities
│   │   └── google.d.ts          # TypeScript definitions for Google API
│   ├── App.tsx                 # Main application entry point
│   ├── AppInitializer.tsx      # App bootstrapper and initialization
│   └── main.tsx                # React DOM rendering
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── vite.config.ts              # Vite build configuration
```

## 🔄 Component & Logic Relations

The application follows a service-oriented architecture to separate UI from data persistence:

1.  **Data Layer (`src/db/schema.ts`)**: 
    - Defines the `KanjoosDatabase` using Dexie.
    - Manages three primary tables: `accounts`, `categories`, and `transactions`.
2.  **Service Layer (`src/services/`)**:
    - `financeService.ts`: Acts as the bridge between the UI and the DB. It ensures atomic updates (e.g., when a transaction is added, the corresponding account balance is updated in the same transaction).
    - `gdriveSync.ts`: Handles OAuth2 flow and interacts with Google Drive API to export/import the entire database state as a JSON file.
3.  **State Management (`src/hooks/`)**:
    - Custom hooks like `useUserSummary.ts` consume the service layer to provide the UI with computed data (e.g., total assets, monthly spending).
4.  **UI Layer (`src/components/`)**:
    - Components trigger actions via `financeService` and display data via hooks.
    - `TransactionModal` $\rightarrow$ `financeService.addTransaction()` $\rightarrow$ `db.transactions` & `db.accounts`.

## 🛠️ Technical Implementation Details

For a deep dive into the technical architecture, code flow, and logic, please refer to the [SKILL.md](./SKILL.md) file.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS, Material UI (MUI)
- **Database**: Dexie.js (IndexedDB)
- **Charts**: Recharts
- **Icons**: Lucide React, MUI Icons
- **Sync**: Google Drive API (OAuth2)

## ⚙️ Installation & Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   bun install
   ```
3. Set up your Google Client ID in a `.env` file:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
   ```
4. Start the development server:
   ```bash
   bun run dev
   ```
