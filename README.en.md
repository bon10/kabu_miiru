# Kabu-Miiru: Stock Portfolio Management System

A comprehensive stock portfolio management solution containing two applications:

1. **Python Stock Price Fetcher** (root directory) - A simple command-line tool that fetches real-time stock prices using yfinance and saves to CSV
2. **Next.js Portfolio Management App** (`stock-portfolio-app/`) - A full-featured web application supporting portfolio management across multiple brokerages

## 🚀 Quick Start

### Python Stock Price Fetcher

```bash
# Install dependencies
pip install -r requirements.txt

# Run stock price fetcher
python main.py
```

### Next.js Portfolio Application

```bash
# Navigate to application directory
cd stock-portfolio-app

# Install dependencies
pnpm install

# Generate Prisma client
pnpm dlx prisma generate

# Apply database schema
pnpm dlx prisma db push

# Start development server
pnpm dev
```

## 📋 Key Features

### Next.js Application Core Features

- **📊 Portfolio Analysis**
  - Composition analysis by stock/brokerage/market
  - Visualization with pie charts and bar charts
  - Profit performance analysis and comparison

- **📈 Stock Management**
  - Support for both Japanese stocks (numeric codes + .T) and US stocks
  - Real-time price updates and price history tracking
  - Stock detail editing and management

- **💰 Transaction Records**
  - Complete tracking of buy/sell transaction history
  - Dividend record management
  - Transaction statistics and filtering capabilities

- **📄 Data Import**
  - Bulk TSV file import functionality
  - Data preview and validation
  - Error handling and correction

- **🎯 Real-time Price System**
  - Automated stock price update mechanism
  - Support for multiple data sources
  - Price history tracking

## 🏗️ Technical Architecture

### Next.js Application

- **Frontend**: Next.js 15 (App Router) + TypeScript + React 19
- **Backend**: Next.js API Routes
- **Database**: MySQL + Prisma ORM
- **UI**: Tailwind CSS + Radix UI + Lucide React
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **Package Manager**: pnpm

### Database Schema

```sql
-- Main Tables
Stock             -- Stock master data
Transaction       -- Transaction history
PriceHistory      -- Price tracking history
DividendHistory   -- Dividend payment history
PortfolioSummary  -- Portfolio summary cache
```

## 🔧 Development Commands

### Database Operations

```bash
cd stock-portfolio-app

# Generate Prisma client
pnpm dlx prisma generate

# Apply schema changes
pnpm dlx prisma db push

# Launch database GUI
pnpm dlx prisma studio

# Reset database
pnpm db:reset
```

### Development and Build

```bash
cd stock-portfolio-app

# Development mode (with Turbopack)
pnpm dev

# Build application
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

### Docker Deployment

```bash
cd stock-portfolio-app

# Start all services (background)
docker-compose up -d

# Stop all services
docker-compose down

# View application logs
docker-compose logs -f app
```

## 📁 Project Structure

```
stock-portfolio-app/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── api/            # API routes
│   │   ├── dashboard/      # Dashboard page
│   │   ├── stocks/         # Stock management pages
│   │   ├── portfolio/      # Portfolio analysis page
│   │   ├── transactions/   # Transaction records page
│   │   └── import/         # Data import page
│   ├── components/         # React components
│   │   ├── ui/            # Basic UI components
│   │   ├── layout/        # Layout components
│   │   └── portfolio/     # Portfolio-specific components
│   ├── lib/               # Utility functions and common logic
│   └── types/             # TypeScript type definitions
├── prisma/                # Database schema and migrations
├── docker/                # Docker-related files
└── docs/                  # Project documentation
```

## 🌐 API Endpoints

### Stock-related
- `GET /api/stocks` - Get all stocks
- `GET /api/stocks/[id]` - Get specific stock details
- `PUT /api/stocks/[id]` - Update stock information

### Portfolio Analysis
- `GET /api/portfolio/composition` - Portfolio composition analysis
- `GET /api/portfolio/performance` - Portfolio performance analysis

### Transaction Records
- `GET /api/transactions` - Get transaction records (supports filtering and pagination)
- `POST /api/transactions` - Add transaction record
- `GET /api/transactions/summary` - Transaction statistics summary

### Price Updates
- `POST /api/prices/update` - Update stock prices
- `GET /api/prices/history/[stockId]` - Stock price history

### Data Import
- `POST /api/import/tsv` - TSV file import

### Summary
- `GET /api/summary` - Overall summary
- `GET /api/summary/by-company` - Company-wise summary

## 💾 Data Processing

### Stock Code Formats
- **Japanese Stocks**: Numeric codes (e.g., "7203") automatically append ".T" suffix for API calls
- **US Stocks**: Standard ticker symbols (e.g., "AAPL", "TSLA")

### TSV Import Format
Supports complete 20-field TSV file import:
- Basic Info: Stock name, code, brokerage, market
- Holdings: Shares held, average cost, investment amount
- P&L Info: Current price, profit/loss, profit/loss rate
- Dividend Info: Dividend per share, dividend yield, dividend amount
- Other: Purchase date, target price, etc.

## 🔍 Development Notes

1. **Stock Data Source**: Uses proprietary Yahoo Finance API integration
2. **Database**: MySQL as default, quick deployment with Docker Compose
3. **Type Safety**: Comprehensive type checking using TypeScript and Zod
4. **Styling System**: Tailwind CSS + CSS Variables for theme switching support
5. **Performance Optimization**: Data caching and synchronization using SWR

## 📈 Future Roadmap

- [ ] User authentication system (NextAuth.js)
- [ ] Multi-currency support
- [ ] Stock price alert functionality
- [ ] More chart analysis features
- [ ] Mobile device optimization
- [ ] API Rate Limiting
- [ ] Stock news integration

## 🤝 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## 🔧 Troubleshooting

### Frequently Asked Questions

**Q: Stock prices not updating**
A: Check network connectivity and Yahoo Finance API availability

**Q: Database connection errors**
A: Verify that the `DATABASE_URL` setting in your `.env` file is correct

**Q: Docker container startup fails**
A: Ensure Docker is running properly and check `docker-compose.yml` configuration

**Q: TSV import fails**
A: Verify file format and field mappings, ensure data format is correct