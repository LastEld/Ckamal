# CogniMesh Security Documentation

> **Security policies, hardening guides, and vulnerability reporting procedures.**

<div align="center">

[![Security Policy](https://img.shields.io/badge/🛡️_Security_Policy-2ecc71?style=for-the-badge)](#security-policy)
[![Hardening Guide](https://img.shields.io/badge/🔒_Hardening-e74c3c?style=for-the-badge)](#hardening-checklist)
[![Report Vulnerability](https://img.shields.io/badge/⚠️_Report_Vulnerability-3498db?style=for-the-badge)](#reporting-vulnerabilities)

</div>

---

## Table of Contents

- [Security Policy](#security-policy)
- [Hardening Checklist](#hardening-checklist)
- [Reporting Vulnerabilities](#reporting-vulnerabilities)
- [Security Architecture](#security-architecture)
- [Compliance](#compliance)
- [Security Updates](#security-updates)
- [Incident Response](#incident-response)

---

## Security Policy

### Supported Versions

| Version | Status | Supported Until |
|:--------|:-------|:----------------|
| 5.0.x   | ✅ Active | March 2027 |
| 4.5.x   | ⚠️ Maintenance | September 2026 |
| < 4.5   | ❌ End of Life | - |

We actively support the latest minor version with security patches. Upgrade to the latest version for full security support.

### Security Features

CogniMesh includes the following security measures:

- **Authentication**: JWT-based authentication with configurable expiration
- **Authorization**: Role-based access control (RBAC)
- **Rate Limiting**: Configurable request throttling per IP and user
- **Input Validation**: Zod schema validation on all inputs
- **SQL Injection Protection**: Parameterized queries exclusively
- **XSS Protection**: Output encoding and Content Security Policy headers
- **Audit Logging**: Complete audit trail of all operations

---

## Hardening Checklist

Use this checklist to secure your CogniMesh installation for production.

### 🔴 Critical (Do Before Production)

- [ ] **Change default JWT secret**
```bash
# Generate a secure secret
openssl rand -base64 32

# Add to .env
JWT_SECRET=your-generated-secret-here
```

- [ ] **Enable authentication**
```bash
# In .env
REQUIRE_AUTH=true
SECURITY_MODE=enforced
```

- [ ] **Set security pepper for password hashing**
```bash
openssl rand -base64 32
# Add to .env
SECURITY_PEPPER=your-pepper-value
```

- [ ] **Restrict CORS origins**
```bash
# In .env - Replace wildcard with your domains
WS_CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
```

- [ ] **Configure rate limiting**
```bash
# In .env - Adjust based on your use case
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX=100             # requests per window
```

- [ ] **Enable audit logging**
```bash
# In .env
AUDIT_LOG_RETENTION_DAYS=90
LOG_LEVEL=info
```

- [ ] **Set secure file permissions**
```bash
# Linux/macOS
chmod 600 .env
chmod -R 750 data/
chmod -R 750 logs/
chown -R cognimesh:cognimesh .

# Windows PowerShell
# .env file permissions
$path = ".env"
$acl = Get-Acl $path

# Remove inherited permissions
$acl.SetAccessRuleProtection($true, $false)

# Add current user only
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $env:USERNAME, "Read,Write", "Allow"
)
$acl.SetAccessRule($rule)
Set-Acl $path $acl
```

### 🟡 High Priority

- [ ] **Enable HTTPS** (Production only)

#### Using Nginx as Reverse Proxy

```nginx
# /etc/nginx/sites-available/cognimesh
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

- [ ] **Configure firewall rules**

#### UFW (Ubuntu/Debian)

```bash
# Install UFW
sudo apt-get install ufw

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (adjust port if needed)
sudo ufw allow 22/tcp

# Allow CogniMesh ports
sudo ufw allow 3000/tcp   # HTTP API
sudo ufw allow 8080/tcp   # WebSocket
sudo ufw allow 3001/tcp   # Dashboard

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

#### Windows Firewall

```powershell
# Allow CogniMesh through Windows Firewall
New-NetFirewallRule -DisplayName "CogniMesh API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "CogniMesh WebSocket" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "CogniMesh Dashboard" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

- [ ] **Disable unnecessary features**
```bash
# In .env - Disable features you don't use
FEATURE_BATCH=false          # If not using batch processing
FEATURE_STREAMING=false      # If not using streaming (reduces attack surface)
```

- [ ] **Configure WebSocket authentication**
```bash
# In .env
WS_REQUIRE_AUTH=true
WS_MAX_PAYLOAD_MB=10         # Limit message size
```

### 🟢 Recommended

- [ ] **Set up log monitoring**
```bash
# Install and configure fail2ban (Linux)
sudo apt-get install fail2ban

# Create CogniMesh filter
sudo tee /etc/fail2ban/filter.d/cognimesh.conf << 'EOF'
[Definition]
failregex = ^.*Failed authentication attempt from <HOST>.*$
            ^.*Rate limit exceeded for <HOST>.*$
ignoreregex =
EOF

# Add jail configuration
sudo tee -a /etc/fail2ban/jail.local << 'EOF'
[cognimesh]
enabled = true
port = 3000,8080,3001
filter = cognimesh
logpath = /opt/cognimesh/logs/app.log
maxretry = 5
bantime = 3600
EOF

sudo systemctl restart fail2ban
```

- [ ] **Enable database encryption at rest**
```bash
# SQLite encryption requires SQLCipher
# Build with SQLCipher support or use filesystem-level encryption

# Linux - LUKS encryption for data directory
# macOS - FileVault
# Windows - BitLocker
```

- [ ] **Set up backup encryption**
```bash
# Create encrypted backup script
#!/bin/bash
BACKUP_DIR="/opt/cognimesh/backups"
DB_PATH="/opt/cognimesh/data/cognimesh.db"
DATE=$(date +%Y%m%d_%H%M%S)
ENCRYPTION_KEY="$(cat /opt/cognimesh/.backup-key)"

# Backup and encrypt
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/temp.db'"
gpg --symmetric --cipher-algo AES256 --batch --passphrase "$ENCRYPTION_KEY" \
    --output "$BACKUP_DIR/cognimesh_$DATE.db.gpg" "$BACKUP_DIR/temp.db"
rm "$BACKUP_DIR/temp.db"

echo "Encrypted backup completed: cognimesh_$DATE.db.gpg"
```

- [ ] **Regular security audits**
```bash
# Run security audit
npm run verify:security

# Check for known vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix
```

**[⬆ Back to Top](#cognimesh-security-documentation)**

---

## Reporting Vulnerabilities

We take security seriously. If you discover a vulnerability, please follow this process:

### Private Disclosure Process

**Please DO NOT file a public GitHub issue for security vulnerabilities.**

Instead:

1. **Email us directly**: security@cognimesh.io
2. **Subject**: `[SECURITY] CogniMesh v5.0 - Brief Description`
3. **Include:**
   - Type of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
   - Your contact information for follow-up

### Response Timeline

| Phase | Timeframe |
|:------|:----------|
| Initial Response | Within 48 hours |
| Vulnerability Assessment | Within 5 business days |
| Fix Development | Depends on severity (see below) |
| Public Disclosure | After fix is released |

### Severity Classifications

| Severity | Examples | Fix Timeline |
|:---------|:---------|:-------------|
| 🔴 Critical | RCE, SQL injection, auth bypass | 72 hours |
| 🟠 High | XSS, privilege escalation | 1 week |
| 🟡 Medium | CSRF, information disclosure | 2 weeks |
| 🟢 Low | Best practice violations | Next release |

### Bug Bounty

We offer recognition and rewards for responsibly disclosed vulnerabilities:

- **Critical**: $500 + Hall of Fame
- **High**: $250 + Hall of Fame
- **Medium**: $100 + Hall of Fame
- **Low**: Hall of Fame

*Rewards are at our discretion and subject to verification.*

### Security Hall of Fame

We publicly acknowledge security researchers who have responsibly disclosed vulnerabilities:

| Researcher | Vulnerability | Date |
|:-----------|:--------------|:-----|
| *Your name here* | - | - |

**[⬆ Back to Top](#cognimesh-security-documentation)**

---

## Security Architecture

### Authentication Flow

```
┌─────────┐     ┌──────────────┐     ┌─────────┐
│  User   │────>│   CogniMesh  │────>│  JWT    │
│         │     │    Server    │     │  Auth   │
└─────────┘     └──────────────┘     └─────────┘
                      │
                      v
               ┌──────────────┐
               │   Resource   │
               │   Access     │
               └──────────────┘
```

### Data Protection

| Layer | Protection |
|:------|:-----------|
| Transport | TLS 1.2+ (HTTPS/WSS) |
| Authentication | JWT with secure secret |
| Database | Parameterized queries, WAL mode |
| Files | Restrictive permissions (600/750) |
| Logs | Audit trail, retention policies |

### Security Headers

CogniMesh sends the following security headers by default:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

**[⬆ Back to Top](#cognimesh-security-documentation)**

---

## Compliance

### GDPR Compliance

- **Data Minimization**: Only collect necessary data
- **Right to Deletion**: All user data can be deleted
- **Audit Trail**: Complete logging of data access
- **Encryption**: Data encrypted in transit and at rest

```bash
# Export user data (GDPR right to portability)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/user/export

# Delete user data (GDPR right to erasure)
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/user/data
```

### SOC 2 Considerations

CogniMesh supports SOC 2 compliance with:

- Access controls and authentication
- Audit logging of all operations
- Encrypted data transmission and storage
- Regular backup and recovery procedures
- Change management through version control

**[⬆ Back to Top](#cognimesh-security-documentation)**

---

## Security Updates

### Automatic Updates

```bash
# Enable automatic security updates
# In .env
AUTO_UPDATE=true
CHECK_INTERVAL=1h
```

### Manual Update Process

```bash
# Check for updates
git fetch origin

# Review security advisories
npm audit

# Update dependencies
npm update

# Run security tests
npm run verify:security

# Deploy
npm run deploy
```

### Security Notifications

Subscribe to security announcements:

- Watch the [GitHub repository](https://github.com/LastEld/Ckamal)
- Enable "Watch > Security alerts" on GitHub
- Join our security mailing list: security-updates@cognimesh.io

**[⬆ Back to Top](#cognimesh-security-documentation)**

---

## Incident Response

### Security Incident Checklist

If you suspect a security breach:

1. **Immediate Actions**
   - [ ] Isolate affected systems
   - [ ] Preserve logs and evidence
   - [ ] Notify security team

2. **Assessment**
   - [ ] Determine scope of breach
   - [ ] Identify compromised data
   - [ ] Check audit logs

3. **Containment**
   - [ ] Rotate all secrets
   - [ ] Revoke compromised sessions
   - [ ] Apply security patches

4. **Recovery**
   - [ ] Restore from clean backup
   - [ ] Verify system integrity
   - [ ] Resume operations

5. **Post-Incident**
   - [ ] Document lessons learned
   - [ ] Update security procedures
   - [ ] Notify affected parties (if required)

### Emergency Contacts

| Role | Contact |
|:-----|:--------|
| Security Team | security@cognimesh.io |
| Emergency Hotline | +1-XXX-XXX-XXXX (24/7) |
| GitHub Security | https://github.com/LastEld/Ckamal/security |

**[⬆ Back to Top](#cognimesh-security-documentation)**

---

<div align="center">

**[Back to Documentation Hub](docs/README.md)** · **[Troubleshooting](docs/TROUBLESHOOTING.md)** · **[Deployment Guide](DEPLOYMENT.md)**

<sub>Last updated: 2026-03-28</sub>

</div>
