# Money Manager (Kanjoos)

A privacy-focused, client-side personal finance manager built with React, TypeScript, and Dexie.js. This application allows users to track accounts, categories, and transactions with local-first storage and optional Google Drive synchronization.

## 🚀 Features

- **Local-First Storage**: Uses Dexie.js (IndexedDB) for fast, offline-capable data management. Your data stays on your device.
- **Comprehensive Account Management**: Support for multiple asset classes including Cash, Savings, Wallets, Credit Cards, Mutual Funds, and Stocks.
- **Powerful Transaction Tracking**: 
    - Log income, expenses, and complex transfers between accounts.
    - Recurring transaction support.
    - Precise date and category assignment.
- **Hierarchical Category System**: Organize spending with main categories and subcategories for granular financial analysis.
- **Privacy-Preserving Google Drive Sync**: 
    - Secure, client-side backup and restore.
    - Uses the `appDataFolder` scope, meaning the app can only access its own data, and the user cannot accidentally delete the backup files from their main Drive.
    - End-to-end data flow remains within the client.
- **Advanced Analytics**: 
    - Periodic and Timeline charts to visualize spending trends.
    - Category breakdown analysis via Recharts.
- **Modern UI/UX**: Built with React 19, Tailwind CSS, and Material UI. Optimized for both desktop and mobile, including iOS safe-area handling.
- **Financial Precision**: All monetary values are stored as integers (cents/paise) to eliminate floating-point errors common in financial apps.

## 📂 Project Structure

```text
money-manager/
├── public/              # Static assets
├── src/
│   ├── assets/          # Images and static assets
│   ├── components/      # UI Components (Tabs, Modals, Dashboard)
│   │   ├── AccountsTab/        # Account management view & logic
│   │   ├── CategoriesTab/      # Category management view & logic
│   │   ├── StatsTab/           # Financial statistics and charts
│   │   ├── TransactionModal/   # Add/Edit transaction dialog
│   │   ├── TransactionTab/     # Transaction history and management
│   │   ├── Dashboard.tsx       # Main overview and summary
│   │   ├── DriveSyncSettings.tsx # Google Drive sync configuration
│   │   ├── SettingsTab.tsx     # App settings
│   │   ├── SummaryTab.tsx      # Transaction summaries
│   │   ├── TabMenu.tsx         # Navigation between views
│   │   └── IosSafeAreaLayoutContainer.tsx # Layout wrapper for iOS devices
│   ├── db/
│   │   └── schema.ts            # Dexie database definition and seeding
│   ├── hooks/                  # Custom React hooks for state and logic
│   │   ├── useGDriveSession.ts  # Google Drive auth session management
│   │   ├── useSettings.ts      # User preference management
│   │   ├── useUserSummary.ts    # Aggregated financial data hooks
│   │   └── useWindowSize.ts    # Responsive design hook
│   ├── services/
│   │   ├── financeService.ts    # Business logic for transactions and balances
│   │   ├── gdriveSync.ts       # Google Drive API integration for backups
│   │   ├── investmentFormulas.ts # Financial calculations for investments
│   │   ├── investmentService.ts # Investment-specific business logic
│   │   ├── themeService.ts      # UI Theme management
│   │   └── gdrive/              # Detailed GDrive implementation utilities
│   │       ├── backupValidation.ts
│   │       ├── driveApiClient.ts
│   │       ├── gdriveTypes.ts
│   │       ├── mergeEntities.ts
│   │       └── tombstoneStore.ts
│   ├── types/
│   │   ├── finance.ts           # Domain types and currency utilities
│   │   └── google.d.ts          # TypeScript definitions for Google API
│   ├── App.tsx                 # Main application entry point
│   ├── AppInitializer.tsx      # App bootstrap and initialization logic
│   └── main.tsx                # React DOM rendering
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── vite.config.ts              # Vite build configuration
```

## 🔄 Architecture & Data Flow

The application follows a service-oriented architecture to ensure a strict separation between the UI, business logic, and data persistence.

### 1. Data Layer (`src/db/schema.ts`)
- **Dexie.js**: Provides a wrapper around IndexedDB.
- **Schema**:
    - `accounts`: Stores balances, types, and metadata for each financial account.
    - `categories`: Stores the hierarchical structure of spending categories.
    - `transactions`: Stores every financial movement, linked to accounts and categories.

### 2. Service Layer (`src/services/`)
This layer contains the "brain" of the application, ensuring data integrity.
- **`financeService.ts`**: Handles the core CRUD operations. It implements atomic transactions—for example, when adding an expense, it simultaneously creates a transaction record and decrements the account balance.
- **`investmentService.ts` & `investmentFormulas.ts`**: Specialized logic for calculating returns and managing investment-specific asset tracking.
- **`gdriveSync.ts` & `gdrive/`**: A robust synchronization engine. It handles OAuth2 authentication, backup validation, and a "tombstone" system to track deletions across synced devices.
- **`themeService.ts`**: Manages the visual state and user preferences for the application's appearance.

### 3. State Management (`src/hooks/`)
Hooks act as the glue between services and components, providing reactive data.
- **`useUserSummary.ts`**: Aggregates raw data from the database into meaningful summaries (e.g., "Net Worth", "Total Monthly Spend").
- **`useGDriveSession.ts`**: Tracks the authentication state and token lifecycle for Google Drive integration.
- **`useSettings.ts`**: Provides a reactive interface for app-wide configuration.

### 4. UI Layer (`src/components/`)
The UI is split into feature-based folders to maintain scalability.
- **Tab-Based Navigation**: The app is organized into `AccountsTab`, `CategoriesTab`, `TransactionTab`, and `StatsTab`.
- **Atomic Components**: Small, reusable views (e.g., `AccountRow`, `TransactionRow`) are nested within feature folders.
- **Responsive Design**: Uses a combination of Tailwind CSS and custom hooks (`useWindowSize`) to adapt to various screen sizes.

## 🛠️ Technical Implementation Details

For a deep dive into the technical architecture, code flow, and logic, please refer to the [SKILL.md](./SKILL.md) file.

## 🛠️ Tech Stack

- **Core**: React 19, TypeScript, Vite
- **Runtime/Package Manager**: [Bun](https://bun.sh/)
- **Styling**: Tailwind CSS, Material UI (MUI)
- **Database**: Dexie.js (IndexedDB)
- **Data Visualization**: Recharts
- **Icons**: Lucide React, MUI Icons
- **API Integration**: Google Drive API (OAuth2)
- **Testing**: Vitest

## ⚙️ Installation & Setup

### Prerequisites
- Install [Bun](https://bun.sh/) as the primary runtime and package manager.

### 1. Clone the Repository
```bash
git clone https://github.com/abhi13x/Kanjoos_Money_Manager.git
cd money-manager
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Environment Configuration
Create a `.env` file in the root directory and add your Google Cloud Console credentials:
```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

### 4. Start Development Server
```bash
bun run dev
```

### 5. Build for Production
```bash
bun run build
```
