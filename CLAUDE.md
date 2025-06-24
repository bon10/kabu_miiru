# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two applications for stock portfolio management:

1. **Python Stock Price Fetcher** (root directory) - A simple command-line tool that fetches current stock prices using yfinance and saves to CSV
2. **Next.js Portfolio Management App** (`stock-portfolio-app/`) - A comprehensive web application for managing stock portfolios across multiple brokers

## Commands

### Python Stock Price Fetcher (root directory)
**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Run the stock price fetcher:**
```bash
python main.py
```

### Next.js Portfolio App (stock-portfolio-app/)
**Development:**
```bash
cd stock-portfolio-app
pnpm dev
```

**Build:**
```bash
cd stock-portfolio-app
pnpm build
```

**Install dependencies:**
```bash
cd stock-portfolio-app
pnpm install
```

**Database operations:**
```bash
cd stock-portfolio-app
pnpm dlx prisma generate    # Generate Prisma client
pnpm dlx prisma db push     # Push schema changes to MySQL database
pnpm dlx prisma studio      # Open database GUI
```

**Docker operations:**
```bash
cd stock-portfolio-app
docker-compose up -d        # Start MySQL and app in background
docker-compose down         # Stop all services
docker-compose logs -f app  # View app logs
```

**Linting:**
```bash
cd stock-portfolio-app
pnpm lint
```

## Architecture

### Python Application (root)
- **main.py**: Core application that defines stock symbols, fetches current prices using yfinance, and saves to CSV
- **stock_prices.csv**: Output file containing fetched stock prices
- **requirements.txt**: Python dependencies including yfinance, pandas, matplotlib

### Next.js Application (stock-portfolio-app/)
- **Tech Stack**: Next.js 15 with App Router, TypeScript, Tailwind CSS, Prisma ORM, MySQL, pnpm
- **Database**: MySQL with comprehensive schema for users, portfolios, stocks, and transactions
- **API**: RESTful endpoints for stock price fetching and portfolio management
- **Authentication**: NextAuth.js ready for implementation
- **Docker**: All Docker-related files organized in `docker/` directory

## Database Configuration

The Next.js app uses MySQL as configured in `.env`:
- Database: stock_portfolio
- User: stock_user
- Connection via Prisma ORM

## Stock Data Processing

Both applications handle Japanese and US stocks:
- **Japanese stocks**: Numeric symbols (e.g., "7203") get ".T" suffix for API calls
- **US stocks**: Standard ticker symbols (e.g., "AAPL", "TSLA")
- Real-time price fetching with automatic database updates (Next.js app)
- Market classification based on symbol format

## Development Notes

- The Python app serves as a prototype/reference for the stock price fetching logic
- The Next.js app implements the same stock symbols and extends functionality with full portfolio management
- Both applications share the same approach to Japanese/US stock symbol handling
- Docker environment is organized in `docker/` directory with COMPOSE_FILE configured in `.env`
- Use pnpm for package management in the Next.js application