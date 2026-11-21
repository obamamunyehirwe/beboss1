# BeBoss Deployment Configuration v2.1.0

## 1. ENVIRONMENT SETUP

### 1.1 Required Secrets (AI Studio or `.env`)

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ADMIN_EMAIL=reponsekdz@gmail.com

# Unlock Code Signing (Generate with: openssl rand -base64 32)
BEBOSS_UNLOCK_SIGNING_SECRET=your-high-entropy-32-plus-char-secret

# Optional: Certificate Pinning (comma-separated SHA-256 pins)
SUPABASE_CERT_PINS=none

# Optional: Crash Reporting
SENTRY_DSN=https://your-sentry-key@sentry.io/project-id

# Optional: Analytics
FIREBASE_PROJECT_ID=your-firebase-project
```

### 1.2 Supabase Database Schema

Execute in Supabase SQL Editor:

```sql
-- Run: /admin-web/supabase_schema.sql
-- This creates all required tables with RLS policies
```

---

## 2. ANDROID APK BUILD & RELEASE

### 2.1 Build Configuration

```bash
# 1. Set up signing keystore
keytool -genkey -v -keystore beboss-release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias beboss-key

# 2. Configure gradle.properties
RELEASE_STORE_FILE=beboss-release.keystore
RELEASE_STORE_PASSWORD=your-keystore-password
RELEASE_KEY_ALIAS=beboss-key
RELEASE_KEY_PASSWORD=your-key-password

# 3. Build release APK
./gradlew :app:assembleRelease

# 4. Verify APK signature
jarsigner -verify -verbose -certs app/build/outputs/apk/release/app-release.apk

# 5. Output: app/build/outputs/apk/release/app-release.apk
```

### 2.2 Google Play Store Upload

1. **Create Developer Account**
   - Go to https://play.google.com/console
   - Create new app: "BeBoss"
   - Category: Business
   - Content rating: Unrated (or complete questionnaire)

2. **Upload APK**
   - Internal Testing → Upload app-release.apk
   - Fill in release notes
   - Set minimum Android version: 7.0 (API 24)

3. **Configure Store Listing**
   - App name: BeBoss
   - Short description: "Offline-first POS for independent retailers"
   - Full description: (from README.md)
   - Screenshots: 5 minimum (showcase POS, inventory, reports)
   - Feature graphic: 1024×500px
   - Privacy policy: https://beboss.rw/privacy
   - Contact email: support@beboss.rw

4. **Beta Testing**
   - Create closed testing track
   - Add 100 beta testers
   - Run for 1 week minimum
   - Monitor crash rates

5. **Production Release**
   - Promote from beta to production
   - Staged rollout: 10% → 50% → 100%
   - Monitor for 48 hours between stages

---

## 3. WEB ADMIN PORTAL DEPLOYMENT

### 3.1 Build & Deploy to Vercel

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Build web app
cd web
npm run build

# 3. Deploy to Vercel
vercel --prod

# 4. Configure environment variables in Vercel dashboard
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
BEBOSS_UNLOCK_SIGNING_SECRET=your-secret

# 5. Output: https://beboss.vercel.app (or custom domain)
```

### 3.2 Deploy to Self-Hosted (Docker)

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

```bash
# Build & run
docker build -t beboss-web .
docker run -p 3000:3000 \
  -e SUPABASE_URL=https://your-project-ref.supabase.co \
  -e SUPABASE_ANON_KEY=your-key \
  beboss-web
```

### 3.3 Configure Custom Domain

```bash
# 1. Point DNS to Vercel nameservers (or CNAME)
admin.beboss.rw CNAME cname.vercel.com

# 2. Add domain in Vercel dashboard
# 3. Vercel auto-provisions SSL certificate
# 4. Verify: https://admin.beboss.rw
```

---

## 4. SUPABASE CONFIGURATION

### 4.1 Database Setup

```bash
# 1. Create Supabase project
# 2. Go to SQL Editor
# 3. Run: /admin-web/supabase_schema.sql
# 4. Verify tables created:
#    - shop_accounts
#    - payment_requests
#    - unlock_codes
#    - shop_devices
#    - shop_users
#    - branch_sync_snapshots
#    - admin_audit_logs
#    - app_config
#    - app_secrets
```

### 4.2 Authentication Setup

```bash
# 1. Go to Authentication → Providers
# 2. Enable Email/Password
# 3. Configure email templates (optional)
# 4. Set redirect URLs:
#    - http://localhost:3000/auth/callback (dev)
#    - https://admin.beboss.rw/auth/callback (prod)
```

### 4.3 Row-Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE shop_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlock_codes ENABLE ROW LEVEL SECURITY;
-- ... etc

-- Create admin role
CREATE ROLE admin_user;

-- Grant permissions (see supabase_schema.sql for full policies)
```

### 4.4 Backup Configuration

```bash
# 1. Go to Database → Backups
# 2. Enable automated backups (daily)
# 3. Set retention: 30 days
# 4. Test restore procedure monthly
```

---

## 5. MONITORING & ALERTING

### 5.1 Supabase Metrics

```bash
# 1. Go to Supabase Dashboard
# 2. Monitor:
#    - Database connections
#    - API request rate
#    - Storage usage
#    - Auth sign-ups
```

### 5.2 Error Tracking (Sentry)

```bash
# 1. Create Sentry account: https://sentry.io
# 2. Create project: BeBoss Android
# 3. Get DSN: https://your-key@sentry.io/project-id
# 4. Add to BuildConfig:
#    SENTRY_DSN=https://your-key@sentry.io/project-id
# 5. Configure alerts:
#    - Crash rate > 1%
#    - Error rate > 5%
#    - New issue detected
```

### 5.3 Uptime Monitoring

```bash
# 1. Use UptimeRobot or similar
# 2. Monitor endpoints:
#    - https://admin.beboss.rw (web)
#    - https://your-project-ref.supabase.co/rest/v1/health (API)
# 3. Alert on downtime > 5 minutes
```

---

## 6. SECURITY HARDENING

### 6.1 SSL/TLS Configuration

```bash
# 1. Enforce HTTPS everywhere
# 2. Set HSTS header (Vercel auto-configures)
# 3. Use TLS 1.2+ only
# 4. Certificate pinning (optional):
#    SUPABASE_CERT_PINS=sha256/AAAA...,sha256/BBBB...
```

### 6.2 API Rate Limiting

```bash
# 1. Configure in Supabase:
#    - Auth: 10 requests/minute per IP
#    - API: 100 requests/minute per user
# 2. Test with: ab -n 1000 -c 10 https://api.example.com
```

### 6.3 Data Encryption

```bash
# 1. Database: AES-256 (SQLCipher on mobile, Supabase encrypted at rest)
# 2. In-transit: TLS 1.3
# 3. Backups: Encrypted by Supabase
# 4. Secrets: Stored in AI Studio Secrets (not in code)
```

---

## 7. PERFORMANCE OPTIMIZATION

### 7.1 CDN Configuration

```bash
# 1. Vercel auto-configures CDN for web
# 2. For custom domain:
#    - Use Cloudflare (free tier)
#    - Enable caching for static assets
#    - Set TTL: 1 year for versioned assets
```

### 7.2 Database Query Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_customers_phone ON customers(phone);
```

### 7.3 API Response Caching

```typescript
// Cache responses for 5 minutes
export const getCachedShops = createServerFn()
  .handler(async ({ context }) => {
    const cacheKey = "shops_list";
    const cached = await context.cache.get(cacheKey);
    if (cached) return cached;
    
    const data = await context.supabase.from("shop_accounts").select("*");
    await context.cache.set(cacheKey, data, 300);  // 5 minutes
    return data;
  });
```

---

## 8. DISASTER RECOVERY

### 8.1 Backup & Restore

```bash
# 1. Supabase automated backups (daily)
# 2. Manual backup (weekly):
pg_dump -h your-project-ref.supabase.co -U postgres -d postgres > backup.sql

# 3. Restore from backup:
psql -h your-project-ref.supabase.co -U postgres -d postgres < backup.sql
```

### 8.2 Failover Plan

```bash
# If primary Supabase project fails:
# 1. Activate standby project (pre-configured)
# 2. Update SUPABASE_URL in all clients
# 3. Redeploy web admin
# 4. Notify users via WhatsApp
# 5. RTO: 15 minutes, RPO: 1 hour
```

### 8.3 Data Recovery

```bash
# If data corrupted:
# 1. Restore from latest backup
# 2. Verify data integrity
# 3. Notify affected shops
# 4. Resync from mobile devices
```

---

## 9. COMPLIANCE & AUDIT

### 9.1 Data Privacy

```bash
# 1. GDPR compliance:
#    - User data deletion on request
#    - Data export functionality
#    - Privacy policy updated
# 2. Local data protection laws:
#    - Rwanda: Data Protection Law 2023
#    - Ensure compliance with local regulations
```

### 9.2 Audit Logging

```sql
-- All admin actions logged
SELECT * FROM admin_audit_logs 
ORDER BY created_at DESC 
LIMIT 100;

-- Export audit trail (monthly)
COPY admin_audit_logs TO '/tmp/audit_2024_11.csv' WITH CSV HEADER;
```

### 9.3 Security Audits

```bash
# 1. Monthly: Review admin_audit_logs
# 2. Quarterly: Penetration testing
# 3. Annually: Third-party security audit
```

---

## 10. OPERATIONAL RUNBOOKS

### 10.1 Incident Response

**Scenario: App crashes on startup**
1. Check Sentry for crash reports
2. Identify affected version
3. Publish hotfix APK
4. Notify users via WhatsApp
5. Monitor crash rate (should drop to < 0.1%)

**Scenario: Sync failures**
1. Check Supabase status dashboard
2. Verify API rate limits not exceeded
3. Check network connectivity
4. Review dead-letter queue
5. Manually retry failed syncs

**Scenario: Unlock code not working**
1. Verify code format (BB2-TIER-DAYS-EXPIRY-HASH-SIG)
2. Check code status in admin console
3. Verify account binding (username + phone)
4. Issue replacement code if needed

### 10.2 Maintenance Windows

```bash
# Schedule: 2 AM UTC (off-peak)
# Duration: 30 minutes maximum
# Notification: 24 hours advance warning

# Steps:
# 1. Announce maintenance window
# 2. Set maintenance mode banner
# 3. Perform updates
# 4. Run integrity checks
# 5. Verify all systems operational
# 6. Remove maintenance banner
```

### 10.3 Performance Tuning

```bash
# Monthly review:
# 1. Database query performance
# 2. API response times
# 3. Sync success rates
# 4. Storage usage
# 5. User growth trends

# Optimization actions:
# - Add indexes for slow queries
# - Increase cache TTL for stable data
# - Archive old audit logs
# - Optimize images/assets
```

---

## 11. LAUNCH CHECKLIST

- [ ] Supabase project created & configured
- [ ] Database schema deployed
- [ ] Secrets configured in AI Studio
- [ ] Android APK built & signed
- [ ] APK uploaded to Google Play (beta)
- [ ] Web admin deployed to Vercel
- [ ] Custom domain configured
- [ ] SSL certificate verified
- [ ] Monitoring & alerting configured
- [ ] Backup & restore tested
- [ ] Disaster recovery plan documented
- [ ] Support channels active (WhatsApp, email)
- [ ] FAQ & documentation published
- [ ] Beta testing completed (1 week)
- [ ] Staged rollout plan ready
- [ ] Incident response procedures documented
- [ ] Team trained on operations
- [ ] Launch announcement prepared

---

## 12. POST-LAUNCH MONITORING (Week 1)

| Metric | Target | Action if Failed |
|--------|--------|------------------|
| Crash Rate | < 0.1% | Publish hotfix |
| Sync Success | > 99.5% | Investigate API |
| API Latency | < 500ms | Optimize queries |
| Unlock Code Success | 100% | Manual verification |
| User Signups | > 50/day | Check marketing |
| Support Tickets | < 10/day | Improve docs |

---

**Status**: Ready for Production ✅  
**Last Updated**: November 2024  
**Next Review**: December 2024
