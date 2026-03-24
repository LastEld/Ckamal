# Backup Automation System

Полная автоматизация бэкапов для CogniMesh с мониторингом, S3-загрузкой и верификацией.

## Созданные файлы

| Файл | Описание |
|------|----------|
| `src/db/backup-scheduler.js` | Планировщик бэкапов с cron, метриками, S3 |
| `scripts/backup-restore.js` | Скрипт восстановления из бэкапа |
| `scripts/backup-verify.js` | Скрипт верификации бэкапов |
| `src/api/routes/backup-monitor.js` | API endpoints для мониторинга |
| `tests/unit/db/backup-scheduler.test.js` | Unit тесты |
| `examples/backup-automation.js` | Пример использования |

## NPM Scripts

```json
"db:backup"            // Create manual backup
"db:backup:restore"    // Restore from backup
"db:backup:verify"     // Verify backups
"db:backup:schedule"   // Start scheduled backups
```

## Быстрый старт

### 1. Запуск планировщика

```javascript
import { BackupScheduler } from './src/db/backup-scheduler.js';

const scheduler = new BackupScheduler({
  schedule: '0 2 * * *',      // Ежедневно в 2:00
  retentionDays: 7,            // Хранить 7 дней
  verifyBackups: true          // Верифицировать после создания
});

await scheduler.initialize();
scheduler.startScheduler();
```

### 2. CLI команды

```bash
# Список бэкапов
node scripts/backup-restore.js --list

# Восстановление
node scripts/backup-restore.js backup-2024-01-15T10-30-00-000Z --force

# Верификация
node scripts/backup-verify.js --verbose

# Удаление повреждённых
node scripts/backup-verify.js --fix
```

### 3. S3 Интеграция

```javascript
const scheduler = new BackupScheduler({
  s3Config: {
    endpoint: 'https://s3.example.com',
    bucket: 'backups',
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    prefix: 'cognimesh/'
  }
});
```

## API Endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/backup/status` | GET | Статус планировщика |
| `/api/backup/metrics` | GET | Метрики бэкапов |
| `/api/backup/health` | GET | Health check |
| `/api/backup/trigger` | POST | Запуск бэкапа |
| `/api/backup/list` | GET | Список бэкапов |
| `/api/backup/verify` | POST | Верификация |
| `/api/backup/cleanup` | POST | Очистка старых |

## Метрики

```javascript
const metrics = scheduler.getMetrics();
// {
//   totalBackups: 100,
//   successfulBackups: 98,
//   failedBackups: 2,
//   lastBackupTime: '2024-01-15T10:30:00.000Z',
//   averageBackupTime: 1500,
//   recentHistory: [...]
// }
```

## Health Check

```bash
curl http://localhost:3000/api/backup/health
```

Ответ:
```json
{
  "status": "healthy",
  "issues": [],
  "latestBackup": {
    "name": "backup-2024-01-15T10-30-00-000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "age": "2 hours ago"
  },
  "schedulerRunning": true
}
```

## Верификация бэкапов

Проверки:
- ✅ Файл существует и доступен для чтения
- ✅ Размер файла > 0
- ✅ SQLite magic bytes
- ✅ SQLite integrity_check
- ✅ Количество таблиц > 0
- ✅ SHA-256 хеш (опционально)

## Тестирование

```bash
npm test -- backup-scheduler.test.js
```

## Архитектура

```
┌─────────────────┐
│ BackupScheduler │
├─────────────────┤
│ - cron schedule │
│ - metrics       │
│ - S3 handler    │
│ - verifier      │
└────────┬────────┘
         │
    ┌────┴────┬─────────────┐
    ▼         ▼             ▼
┌────────┐ ┌────────┐  ┌──────────┐
│ Manager│ │ Metrics│  │ Verifier │
└────────┘ └────────┘  └──────────┘
```
