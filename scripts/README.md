# BIOS Test Runners

Адаптеры для запуска BIOS test-runners из `src/bios/test-runners/` через npm.

## Скрипты

| Скрипт | Описание |
|--------|----------|
| `run-bios-unit.js` | Запуск unit-тестов |
| `run-bios-integration.js` | Запуск integration-тестов |
| `run-bios-performance.js` | Запуск performance-тестов |
| `run-bios-security.js` | Запуск security-сканирования |

## Использование через npm

```bash
# Unit тесты
npm run test:bios:unit

# Integration тесты
npm run test:bios:integration

# Performance тесты
npm run test:bios:performance

# Security сканирование
npm run test:bios:security

# Все тесты BIOS
npm run test:bios:all
```

## Опции командной строки

### Unit Tests (`test:bios:unit`)

```bash
npm run test:bios:unit -- [options]
```

| Опция | Описание |
|-------|----------|
| `--coverage` | Включить сбор покрытия кода |
| `--serial` | Запускать тесты последовательно |
| `--watch` | Режим наблюдения (в разработке) |
| `--tag <tag>` | Фильтр по тегам |
| `--pattern <pattern>` | Паттерн для поиска тестов |

### Integration Tests (`test:bios:integration`)

```bash
npm run test:bios:integration -- [options]
```

| Опция | Описание |
|-------|----------|
| `--scenario <name>` | Запустить конкретный сценарий |
| `--tag <tag>` | Фильтр по тегам |
| `--timeout <ms>` | Таймаут для setup/teardown |

### Performance Tests (`test:bios:performance`)

```bash
npm run test:bios:performance -- [options]
```

| Опция | Описание |
|-------|----------|
| `--duration <seconds>` | Длительность теста (по умолчанию: 30) |
| `--warmup <seconds>` | Время разогрева (по умолчанию: 5) |
| `--concurrency <n>` | Количество конкурентных запросов |
| `--no-latency` | Отключить измерение latency |
| `--no-throughput` | Отключить измерение throughput |
| `--no-memory` | Отключить измерение памяти |
| `--save-report` | Сохранить отчет в файл |
| `--baseline <name>` | Сравнить с baseline |

### Security Tests (`test:bios:security`)

```bash
npm run test:bios:security -- [options]
```

| Опция | Описание |
|-------|----------|
| `--severity <level>` | Минимальный уровень серьезности (low/medium/high/critical) |
| `--fail-on <level>` | Упасть при наличии уязвимостей уровня (по умолчанию: high) |
| `--no-owasp` | Отключить OWASP сканирование |
| `--no-secrets` | Отключить поиск секретов |
| `--no-dependencies` | Отключить проверку зависимостей |
| `--save-report` | Сохранить отчет в файл |
| `--file <path>` | Сканировать конкретный файл |

## Примеры

```bash
# Unit тесты с покрытием
npm run test:bios:unit -- --coverage

# Конкретный integration сценарий
npm run test:bios:integration -- --scenario "api-flow"

# Performance тест с baseline
npm run test:bios:performance -- --duration 60 --baseline v1.0

# Security scan только критических уязвимостей
npm run test:bios:security -- --severity critical --fail-on critical
```

## Структура тестов

Тесты должны быть размещены в соответствующих директориях:

```
tests/
├── unit/           # Unit тесты (*.test.js)
├── integration/    # Integration тесты (*.test.js)
├── performance/    # Performance тесты (*.perf.js)
├── security/       # Security тесты и отчеты
│   └── reports/
└── e2e/           # E2E тесты
```

## Выходные коды

| Код | Описание |
|-----|----------|
| 0 | Успешно, проблем не найдено |
| 1 | Найдены ошибки/уязвимости |
| 2 | Performance regression |
