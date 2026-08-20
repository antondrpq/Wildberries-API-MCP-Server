# Wildberries API MCP Server

[![CI](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/ci.yml/badge.svg)](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/ci.yml)
[![Docker publish](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/docker-publish.yml)

HTTP/MCP-сервер для работы с Wildberries API: аналитика, статистика продвижения, остатки, CSV-отчёты и импорт выгрузок EVIRMA PRO.

## Требования

- Node.js **22 или выше**;
- npm;
- Docker/Docker Compose — опционально;
- токен Wildberries API с нужными разрешениями.

## Запуск

```bash
git clone https://github.com/antondrpq/Wildberries-API-MCP-Server.git
cd Wildberries-API-MCP-Server
npm install
npm start
```

По умолчанию сервер слушает порт `3000`.

```bash
PORT=8080 npm start
```

Проверка:

```bash
curl http://localhost:3000/health
```

## Docker

```bash
docker build -t wb-api-mcp-server .
docker run -p 3000:3000 -d --name wb-api-mcp wb-api-mcp-server
```

Или используйте опубликованный образ:

```bash
docker pull ghcr.io/antondrpq/wildberries-api-mcp-server:latest
docker run -p 3000:3000 -d --name wb-api-mcp ghcr.io/antondrpq/wildberries-api-mcp-server:latest
```

## Контроль входных контрактов

Production entrypoint — `wb-api-mcp-server.js`. В нём подключён единый `apiContractMiddleware`, который выполняет локальную проверку запроса **до** исходящего вызова Wildberries.

Некорректные запросы получают HTTP `400` и не расходуют лимит WB API.

Покрытые группы:

- **Sales Funnel v3** — нормализация legacy-полей и ограничения периода/фильтров;
- **Search Report v2** — обязательные поля и ограничения параметров для поддерживаемых маршрутов;
- **Stocks Report v2** — допустимые фильтры, пагинация и размеры массивов;
- **Advertising Fullstats** — 1–50 ID кампаний и период максимум 31 день.

Подробности: [`docs/API-CONTRACTS.md`](docs/API-CONTRACTS.md).

## Основные локальные маршруты

### Реклама

- `POST /api/adv/normquery/stats` → WB `POST /adv/v0/normquery/stats`
- `POST /api/adv/normquery/stats-v1` → WB `POST /adv/v1/normquery/stats`
- `GET /api/adv/fullstats` → WB `GET /adv/v3/fullstats`
- `POST /api/adv/stats` → WB Media `POST /adv/v1/stats`

Следующие маршруты сохранены для обратной совместимости и считаются legacy/deprecated:

- `GET /api/adv/auto/stat-words`
- `GET /api/adv/stat/words`
- `GET /api/adv/stats/keywords`

Они **не удаляются и не заменяются предположительными аналогами**, пока для конкретного use case не подтверждён официальный replacement WB. Подробнее: [`docs/ADVERTISING_API_STATUS.md`](docs/ADVERTISING_API_STATUS.md).

### Sales Funnel

- `POST /api/nm-report/detail`
- `POST /api/nm-report/detail/history`
- `POST /api/nm-report/grouped/history`

Сервер поддерживает legacy-поля `period`, `nmIDs`, `objectIDs`, `tagIDs` и нормализует их для текущего Analytics v3.

### Search Report

- `POST /api/search-report/report`
- `POST /api/search-report/table/groups`
- `POST /api/search-report/table/details`
- `POST /api/search-report/product/search-texts`
- `POST /api/search-report/product/orders`

### Stocks Report

- `POST /api/stocks-report/products/groups`
- `POST /api/stocks-report/products/products`
- `POST /api/stocks-report/products/sizes`
- `POST /api/stocks-report/offices`

### Дополнительно

- CSV Seller Analytics: `/api/nm-report/downloads`
- EVIRMA import: `/api/evirma/import/keywords-report`
- EVIRMA import: `/api/evirma/import/daily-zone-stats`
- Healthcheck: `GET /health`

## Авторизация

Передавайте токен Wildberries в заголовке:

```text
api-key: ВАШ_WB_API_TOKEN
```

`/health` не требует API-ключа.

## Тесты и линтер

```bash
npm test
npm run lint
```

Контрактные тесты находятся в:

- `tests/apiContractValidation.test.js`
- `tests/apiContractValidation.integration.test.js`

Integration-тесты импортируют реальный production application module `wb-api-mcp-server.js`, поэтому проверяют тот же validation layer, который используется при обычном Node.js/Docker запуске.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---:|---|
| `PORT` | `3000` | HTTP-порт |
| `NODE_ENV` | `production` | Среда запуска |
| `RATE_LIMIT_MAX` | `100` | Максимум входящих запросов с одного IP в минуту |

## Безопасность

- API-токены не сохраняются сервером.
- Docker-контейнер запускается от непривилегированного пользователя `appuser`.
- В production рекомендуется HTTPS.
- Встроен rate limiting входящих запросов.
- EVIRMA-файлы ограничены 15 МБ и обрабатываются в памяти.

## Scope

Календарь акций и категория WB «Цены и скидки» намеренно не входят в текущий scope проекта.
