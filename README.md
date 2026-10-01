# Garage Management System

A comprehensive garage management system built with Django REST Framework, Next.js, and PostgreSQL.

## Features

- 🔐 Role-based access control (Admin, Manager, Cashier, Storekeeper)
- 📦 Inventory management with stock movements and low-stock alerts
- 💰 Sales with receipts (PDF) and automatic stock deduction
- 🛒 Purchases from suppliers with automatic stock-in on receive
- 🧾 Debts tracking (receivables & payables) with payment history
- ⚖️ Stock reconciliation with audit trail
- 📊 Reports with charts — PDF & Excel export
- 👥 User management and full audit log
- 💵 Configurable currency (UGX, KES, USD, ...) and business details
- 📱 Responsive UI

## Tech Stack

- **Backend:** Django 5, Django REST Framework, SimpleJWT, ReportLab, openpyxl
- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS, Recharts
- **Database:** PostgreSQL (works with Neon, RDS, or self-hosted)

## Project Structure
