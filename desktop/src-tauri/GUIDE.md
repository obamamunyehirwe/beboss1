# BeBoss Desktop Quick Start Guide

Welcome to BeBoss Desktop - your retail operations command center!

## What's New in Version 1.2.0

• **Powerful Setup Wizard** - Automated system configuration
• **Enhanced Installer** - Modern Windows 11 NSIS with dependency checks  
• **Offline-First Architecture** - Work without internet, sync when connected
• **Encrypted Database** - AES-256 encryption for all local data
• **Real-time Sync** - Automatic bidirectional sync with Android POS

## Getting Started

### 1. Sign In
Enter your BeBoss shop owner credentials (username + phone number). You'll receive an SMS verification code.

### 2. Sync Your Shop
Upon first login, BeBoss will sync your shop data from the cloud. This includes:
- Product catalog and inventory
- Customer records and credit balances
- Sales history
- Branch and staff assignments

### 3. Connect Android Terminal
For the best experience, sync your Android BeBoss app with this desktop:
1. Open Android app → Settings → Shop Devices
2. Generate a pairing code
3. Enter the code in Desktop → POS Terminals

## Key Features

### Point of Sale
- Product search with barcode scanner support
- Split tender (Cash + Mobile Money + Card + Credit)
- Customer debt tracking
- Receipt preview and printing (ESC/POS and PDF)

### Inventory Management
- Product catalog with cost/margin tracking
- Stock levels and low-stock alerts
- Purchase ledger and supplier tracking
- Branch-to-branch stock transfers

### Customer Management
- Customer profiles with credit limits
- Debt balance and payment history
- Purchase history per customer

### Reports & Analytics
- Daily sales summary
- Revenue and profit tracking
- Product performance reports
- 14-day demand forecasting

### Multi-Branch Operations
- Branch management
- Staff role assignments
- Device pairing and monitoring
- Cross-branch stock transfers

## Offline Mode

BeBoss works offline! When the internet is unavailable:
- All sales and inventory changes are queued locally
- Encrypted SQLite database stores pending transactions
- Automatic sync resumes when connection returns
- Conflict resolution preserves data integrity

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + K` | Command palette |
| `Ctrl + N` | New sale |
| `Ctrl + P` | Print receipt |
| `Ctrl + S` | Save changes |
| `Ctrl + R` | Refresh sync |
| `F11` | Fullscreen |

## Data & Security

- **Encryption**: All local data encrypted with AES-256
- **Keyring**: Secure credential storage using OS keyring
- **Sync Security**: TLS 1.3, signed snapshots, HMAC verification
- **Backup**: Export .bbbackup files for disaster recovery

## Troubleshooting

### WebView2 Missing
BeBoss requires Microsoft Edge WebView2 runtime. Download from:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### Sync Issues
1. Check internet connection
2. Click "Refresh" in the top toolbar
3. Check Sync Hub for error details

### Performance Tips
- Close unused browser tabs to free memory
- Use wired ethernet for faster sync
- Regularly export backups

## Support

• Website: https://beboss.rw
• Email: support@beboss.rw
• Phone: +250 7XX XXX XXX

---

© 2024 BeBoss Retail Operations. All rights reserved.
Version 1.2.0
