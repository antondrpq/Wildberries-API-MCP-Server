# Руководство по использованию Wildberries API MCP сервера

[![CI](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/ci.yml/badge.svg)](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/ci.yml)
[![Docker publish](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/antondrpq/Wildberries-API-MCP-Server/actions/workflows/docker-publish.yml)

> Репозиторий: https://github.com/antondrpq/Wildberries-API-MCP-Server

## Содержание

1. [Введение](#введение)
2. [Установка и запуск](#установка-и-запуск)
3. [Доступные инструменты API](#доступные-инструменты-api)
4. [MCP-агенты](#mcp-агенты)
5. [Примеры использования](#примеры-использования)
6. [Типичные сценарии использования](#типичные-сценарии-использования)
7. [Получение токена API](#получение-токена-api)
8. [Устранение неполадок](#устранение-неполадок)
9. [Деплой на Cloudflare Workers](#деплой-на-cloudflare-workers)
10. [Безопасность и продакшн-эксплуатация](#безопасность-и-продакшн-эксплуатация)

## Введение

Wildberries API MCP сервер представляет собой промежуточный сервис, который упрощает взаимодействие с API Wildberries. Он предоставляет унифицированный HTTP-интерфейс для аналитики, статистики продвижения, работы с остатками, CSV-отчётами и импорта данных EVIRMA PRO.

MCP сервер выполняет следующие функции:

* упрощает обращение к различным эндпоинтам API Wildberries;
* централизованно передаёт `api-key` клиента в `Authorization` при обращении к WB;
* обрабатывает ошибки API и ограничения частоты запросов;
* сохраняет совместимость локальных маршрутов при миграции WB API;
* унифицирует обработку ответов;
* принимает и нормализует выгрузки EVIRMA PRO.

## Установка и запуск

### Необходимые предварительные требования

* Node.js **20 или выше**;
* npm;
* Docker и Docker Compose (опционально, для контейнеризации);
* токен API Wildberries с необходимыми разрешениями.

### Способ 1: Прямая установка через Node.js

```bash
git clone https://github.com/antondrpq/Wildberries-API-MCP-Server.git
cd Wildberries-API-MCP-Server
npm install
npm start
```

Сервер запустится на порту `3000` по умолчанию.

Можно указать другой порт:

```bash
PORT=8080 npm start
```

### Переменные окружения

Скопируйте `.env.example` в `.env` и при необходимости отредактируйте:

```bash
cp .env.example .env
```

| Переменная       | По умолчанию | Описание                                        |
| ---------------- | -----------: | ----------------------------------------------- |
| `PORT`           |       `3000` | Порт HTTP-сервера                               |
| `NODE_ENV`       | `production` | `production` / `development` / `test`           |
| `RATE_LIMIT_MAX` |        `100` | Максимум входящих запросов с одного IP в минуту |

### Тесты и линтер

```bash
npm test
npm run lint
```

Локально проект проверяется через Jest + Supertest и ESLint.

### Способ 2: Использование Docker

```bash
docker build -t wb-api-mcp-server .
docker run -p 3000:3000 -d --name wb-api-mcp wb-api-mcp-server
```

Проверка:

```bash
curl http://localhost:3000/health
```

Ожидаемый ответ:

```json
{
  "status": "ok",
  "timestamp": "2026-08-19T..."
}
```

### Способ 3: Использование Docker Compose

```bash
cp .env.example .env
docker-compose up -d
docker-compose down
```

### Способ 4: Готовый образ из GitHub Container Registry

Актуальный образ публикуется в GHCR:

```bash
docker pull ghcr.io/antondrpq/wildberries-api-mcp-server:latest
docker run -p 3000:3000 -d --name wb-api-mcp ghcr.io/antondrpq/wildberries-api-mcp-server:latest
```

Проверка:

```bash
curl http://localhost:3000/health
```

## Доступные инструменты API

Сервер предоставляет следующие группы эндпоинтов.

### 1. Статистика продвижения

#### Поисковые кластеры рекламы

* **POST `/api/adv/normquery/stats`** — статистика поисковых кластеров через WB `POST /adv/v0/normquery/stats`.
* **POST `/api/adv/normquery/stats-v1`** — статистика поисковых кластеров с детализацией через WB `POST /adv/v1/normquery/stats`.

#### Статистика рекламных кампаний

* **GET `/api/adv/fullstats`** — статистика рекламных кампаний через WB `GET /adv/v3/fullstats`.
* **POST `/api/adv/stats`** — статистика медийных кампаний через WB `POST /adv/v1/stats`.

#### Устаревающие методы

Следующие локальные маршруты сохранены для совместимости, но требуют отдельной проверки актуальных методов WB API:

* **GET `/api/adv/auto/stat-words`**
* **GET `/api/adv/stat/words`**
* **GET `/api/adv/stats/keywords`**

### 2. Воронка продаж (Sales Funnel)

Локальные маршруты сохранены для обратной совместимости, но внутри используют актуальный WB Analytics v3:

* **POST `/api/nm-report/detail`** → `POST /api/analytics/v3/sales-funnel/products`
* **POST `/api/nm-report/detail/history`** → `POST /api/analytics/v3/sales-funnel/products/history`
* **POST `/api/nm-report/grouped/history`** → `POST /api/analytics/v3/sales-funnel/grouped/history`

Сервер умеет преобразовывать legacy-поля старого формата (`period`, `nmIDs`, `objectIDs`, `tagIDs`) в формат v3 (`selectedPeriod`, `nmIds`, `subjectIds`, `tagIds` и другие).

### 3. Поисковые запросы

Текущая реализация использует WB Analytics v2:

* **POST `/api/search-report/report`** — основной отчёт по поисковым запросам.
* **POST `/api/search-report/table/groups`** — пагинация по группам поисковых запросов.
* **POST `/api/search-report/table/details`** — пагинация по товарам внутри группы.
* **POST `/api/search-report/product/search-texts`** — поисковые тексты конкретного товара.
* **POST `/api/search-report/product/orders`** — заказы и позиции по поисковым текстам товара.

Пример основного отчёта:

```javascript
const searchReport = await fetchFromMcp('/api/search-report/report', 'POST', {
  currentPeriod: {
    start: '2026-08-12',
    end: '2026-08-18'
  },
  positionCluster: 'all',
  orderBy: {
    field: 'avgPosition',
    mode: 'desc'
  },
  limit: 100,
  offset: 0
});
```

### 4. Отчёт по остаткам (Stocks Report)

Текущая реализация использует WB Analytics v2:

* **POST `/api/stocks-report/products/groups`**
* **POST `/api/stocks-report/products/products`**
* **POST `/api/stocks-report/products/sizes`**
* **POST `/api/stocks-report/offices`**

Пример:

```javascript
const stocksReport = await fetchFromMcp('/api/stocks-report/products/products', 'POST', {
  nmIDs: [178773045],
  currentPeriod: {
    start: '2026-08-12',
    end: '2026-08-18'
  },
  stockType: '',
  skipDeletedNm: true,
  orderBy: {
    field: 'avgOrders',
    mode: 'desc'
  },
  offset: 0
});
```

### 5. CSV-отчёты продавца (Seller Analytics CSV)

* **POST `/api/nm-report/downloads`** — создание CSV-отчёта.
* **GET `/api/nm-report/downloads`** — получение списка отчётов.
* **POST `/api/nm-report/downloads/retry`** — повторная генерация отчёта.
* **GET `/api/nm-report/downloads/file/:downloadId`** — скачивание ZIP-файла отчёта.

### 6. Импорт данных EVIRMA PRO

* **POST `/api/evirma/import/keywords-report`** — импорт XLS/XLSX-отчёта «Статистика РК по ключевым фразам».
* **POST `/api/evirma/import/daily-zone-stats`** — импорт XLS/XLSX-отчёта «Статистика РК по дням и зонам показов».

EVIRMA PRO не предоставляет публичного API; сервер обрабатывает вручную экспортированные файлы.

### 7. Healthcheck

* **GET `/health`** — проверка работоспособности сервера без API-ключа.

## MCP-агенты

Помимо REST-эндпоинтов выше, сервер также отдаёт **MCP Streamable HTTP** эндпоинт (`POST /mcp`) с 32 инструментами, сгруппированными в четыре функциональных агента:

* **Финансист** — баланс, отчёты реализации, эквайринг, готовый P&L одним вызовом (`wb_finance_summary`).
* **Реклама** — кампании, баланс кабинета продвижения, бюджеты, ставки, агрегированная сводка (`wb_ads_summary`).
* **Ответы покупателям** — отзывы, вопросы, чаты с покупателями (чтение и ответ).
* **Управляющий магазина** — тарифы, FBS-заказы, сводка «здоровья бизнеса» (`wb_business_summary`).

Часть инструментов — `WRITE` (публикуют текст, видимый покупателю) или `WRITE / DESTRUCTIVE` (например, отмена заказа); полный список с пометками и требуемыми категориями токена — в [`MCP.md`](./MCP.md).

Это отдельный протокол поверх того же порта, не подмножество REST API из раздела выше — предназначен для подключения к MCP-клиентам (например, Claude) как единый набор инструментов, а не для прямых HTTP-вызовов из своего кода.

Подробности: конфигурация, полный список всех 32 инструментов с описаниями, известные лимиты частоты запросов WB и пример smoke-теста через PowerShell — см. **[`MCP.md`](./MCP.md)**.

## Примеры использования

### Получение статистики рекламных кампаний

`/api/adv/fullstats` — локальный **GET**-маршрут, который проксирует актуальный WB `GET /adv/v3/fullstats`.

```javascript
const params = new URLSearchParams({
  ids: '1234567',
  beginDate: '2026-08-12',
  endDate: '2026-08-18'
});

const response = await fetch(
  `http://localhost:3000/api/adv/fullstats?${params.toString()}`,
  {
    headers: {
      'api-key': 'ВАШ_ТОКЕН_WILDBERRIES_API'
    }
  }
);

const data = await response.json();
console.log(data);
```

> Параметры конкретного запроса должны соответствовать текущей схеме WB `GET /adv/v3/fullstats`.

### Статистика поисковых кластеров рекламы

Для `v0` и `v1` используются разные имена полей.

Пример `v0`:

```javascript
const response = await fetch('http://localhost:3000/api/adv/normquery/stats', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-key': 'ВАШ_ТОКЕН_WILDBERRIES_API'
  },
  body: JSON.stringify({
    from: '2026-08-12',
    to: '2026-08-18',
    items: [
      {
        advert_id: 1234567,
        nm_id: 178773045
      }
    ]
  })
});
```

Пример `v1`:

```javascript
const response = await fetch('http://localhost:3000/api/adv/normquery/stats-v1', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-key': 'ВАШ_ТОКЕН_WILDBERRIES_API'
  },
  body: JSON.stringify({
    from: '2026-08-12',
    to: '2026-08-18',
    items: [
      {
        advertId: 1234567,
        nmId: 178773045
      }
    ]
  })
});
```

### Получение статистики карточки товара

Сервер сохраняет привычный локальный маршрут, но внутри использует Sales Funnel v3:

```javascript
const response = await fetch('http://localhost:3000/api/nm-report/detail', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-key': 'ВАШ_ТОКЕН_WILDBERRIES_API'
  },
  body: JSON.stringify({
    nmIDs: [178773045],
    period: {
      begin: '2026-08-12',
      end: '2026-08-18'
    }
  })
});

const data = await response.json();
console.log(data);
```

### Анализ поисковой видимости

```javascript
const searchReport = await fetch('http://localhost:3000/api/search-report/report', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-key': 'ВАШ_ТОКЕН_WILDBERRIES_API'
  },
  body: JSON.stringify({
    currentPeriod: {
      start: '2026-08-12',
      end: '2026-08-18'
    },
    positionCluster: 'all',
    orderBy: {
      field: 'avgPosition',
      mode: 'desc'
    },
    limit: 100,
    offset: 0
  })
});

const data = await searchReport.json();
console.log(data);
```

### Поисковые тексты товара

```javascript
const searchTexts = await fetchFromMcp('/api/search-report/product/search-texts', 'POST', {
  currentPeriod: {
    start: '2026-08-12',
    end: '2026-08-18'
  },
  nmIds: [178773045],
  topOrderBy: 'openCard',
  limit: 20
});
```

### Управление запасами

```javascript
const stocksReport = await fetchFromMcp('/api/stocks-report/products/products', 'POST', {
  nmIDs: [178773045],
  currentPeriod: {
    start: '2026-08-12',
    end: '2026-08-18'
  },
  stockType: '',
  skipDeletedNm: true,
  orderBy: {
    field: 'avgOrders',
    mode: 'desc'
  },
  offset: 0
});
```

### Импорт отчёта EVIRMA PRO

```bash
curl -X POST http://localhost:3000/api/evirma/import/keywords-report \
  -H "api-key: ВАШ_ТОКЕН_WILDBERRIES_API" \
  -F "file=@Экспорт_..._cmp-advert-keywords-stats_....xlsx"
```

Размер файла ограничен 15 МБ. Поддерживаются `.xlsx` и `.xls`.

## Типичные сценарии использования

### 1. Мониторинг эффективности рекламных кампаний

1. Получать статистику рекламных кампаний через `/api/adv/fullstats`.
2. Получать поисковые кластеры рекламы через `/api/adv/normquery/stats` или `/api/adv/normquery/stats-v1`.
3. Сохранять результаты в БД для исторического анализа.
4. Сравнивать показы, клики, расходы, корзины и заказы.

### 2. Анализ воронки продаж товаров

1. `/api/nm-report/detail` — детальная воронка по товарам.
2. `/api/nm-report/detail/history` — динамика по дням.
3. `/api/nm-report/grouped/history` — агрегированные данные по брендам, предметам и тегам.
4. Выявлять товары с низкими конверсиями и анализировать этапы просмотра → корзина → заказ → выкуп.

### 3. Оптимизация поисковой видимости

Используйте:

* `/api/search-report/report`;
* `/api/search-report/table/groups`;
* `/api/search-report/table/details`;
* `/api/search-report/product/search-texts`;
* `/api/search-report/product/orders`.

Это позволяет анализировать позиции, поисковые фразы, переходы и заказы.

### 4. Управление запасами

Используйте `stocks-report` для оценки:

* текущих остатков;
* средних заказов;
* скорости продаж;
* распределения по складам;
* потенциального времени покрытия запасами.

### 5. Генерация расширенных CSV-отчётов

Рекомендуемая последовательность:

```text
POST /api/nm-report/downloads
        ↓
GET /api/nm-report/downloads
        ↓
POST /api/nm-report/downloads/retry  (если FAILED)
        ↓
GET /api/nm-report/downloads/file/:downloadId
```

## Получение токена API

1. Войдите в личный кабинет продавца Wildberries.
2. Откройте раздел управления API.
3. Создайте токен с необходимыми разрешениями.
4. Для аналитики и продвижения выдайте соответствующие права.
5. Сохраните токен безопасно: сервер не сохраняет его и принимает в заголовке `api-key` на каждый запрос.

## Устранение неполадок

### `401 Unauthorized`

Проверьте наличие заголовка:

```text
api-key: ВАШ_ТОКЕН_WILDBERRIES_API
```

### `400 Bad Request`

Проверьте структуру `body` и обязательные поля конкретного WB endpoint.

### `429 Too Many Requests`

Сервер возвращает `429`. Если Wildberries передаёт заголовок `X-RateLimit-Retry`, сервер:

* возвращает его клиенту как HTTP-заголовок `X-RateLimit-Retry`;
* добавляет его значение в `details.retryAfter`.

Пример:

```json
{
  "error": true,
  "message": "Rate limit exceeded. Please try again later.",
  "details": {
    "status": 429,
    "retryAfter": "1473"
  }
}
```

Соблюдайте указанный WB интервал перед повторным запросом.

### `404 Not Found`

Проверьте путь локального маршрута и актуальность соответствующего WB API метода.

### Просмотр логов

```bash
docker logs wb-api-mcp
```

### Проверка работоспособности

```bash
curl http://localhost:3000/health
```

## Деплой на Cloudflare Workers

Сервер поддерживает отдельную обёртку для Cloudflare Workers через `wrangler`. Для обычного Node.js/Docker-деплоя эти файлы не требуются.

```bash
npm run deploy:cloudflare
```

Учитывайте:

* `express-rate-limit` хранит счётчик в памяти процесса;
* длительные или тяжёлые обработки `.xlsx` ограничены CPU и памятью среды;
* файлы EVIRMA обрабатываются в памяти запроса;
* для максимально предсказуемого Node.js-окружения рекомендуется Docker.

## Безопасность и продакшн-эксплуатация

* HTTPS обязателен в продакшне.
* API-токен не хранится сервером и передаётся клиентом через `api-key`.
* `/health` не требует авторизации.
* Встроен rate limit на входящие запросы.
* Рекомендуется включать Dependabot и CodeQL в настройках GitHub-репозитория.
* Docker-контейнер запускается от непривилегированного пользователя `appuser`.
* EVIRMA-загрузки ограничены 15 МБ и типами `.xlsx/.xls`.
* Файлы EVIRMA обрабатываются только в памяти и не сохраняются на диск.
