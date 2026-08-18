# Руководство по использованию Wildberries API MCP сервера

![CI](https://github.com/ВАШ_ЛОГИН/wb-api-mcp-server/actions/workflows/ci.yml/badge.svg)
![Docker publish](https://github.com/ВАШ_ЛОГИН/wb-api-mcp-server/actions/workflows/docker-publish.yml/badge.svg)

> Замените `ВАШ_ЛОГИН` в бейджах выше на имя вашего аккаунта/организации на GitHub после публикации репозитория.

## Содержание
1. [Введение](#введение)
2. [Установка и запуск](#установка-и-запуск)
3. [Доступные инструменты API](#доступные-инструменты-api)
4. [Примеры использования](#примеры-использования)
5. [Типичные сценарии использования](#типичные-сценарии-использования)
6. [Получение токена API](#получение-токена-api)
7. [Устранение неполадок](#устранение-неполадок)

## Введение

Wildberries API MCP сервер представляет собой промежуточный сервис, который упрощает взаимодействие с API Wildberries. Он предоставляет унифицированный интерфейс для доступа к данным аналитики, статистике продвижения и другой информации из Wildberries API.

MCP сервер выполняет следующие функции:
- Упрощает обращение к различным эндпоинтам API Wildberries
- Обрабатывает ошибки и ограничения частоты запросов
- Унифицирует формат ответов
- Обеспечивает централизованную аутентификацию

## Установка и запуск

### Необходимые предварительные требования
- Node.js (версия 14 или выше)
- npm или yarn
- Docker и Docker Compose (опционально, для контейнеризации)
- Токен API Wildberries с соответствующими разрешениями

### Способ 1: Прямая установка через Node.js

```bash
# Клонирование репозитория
git clone https://github.com/yourusername/wb-api-mcp-server.git
cd wb-api-mcp-server

# Установка зависимостей
npm install

# Запуск сервера
npm start
```

Сервер запустится на порту 3000 по умолчанию. Вы можете указать другой порт, установив переменную окружения `PORT`:

```bash
PORT=8080 npm start
```

### Переменные окружения

Скопируйте `.env.example` в `.env` и при необходимости отредактируйте:

```bash
cp .env.example .env
```

| Переменная       | По умолчанию | Описание                                              |
|------------------|--------------|--------------------------------------------------------|
| `PORT`           | `3000`       | Порт, на котором слушает сервер                        |
| `NODE_ENV`       | `production` | `production` / `development` / `test`                  |
| `RATE_LIMIT_MAX` | `100`        | Максимум запросов с одного IP в минуту                 |

### Тесты и линтер

```bash
npm test    # запускает Jest + Supertest
npm run lint
```

Оба шага автоматически выполняются в GitHub Actions при каждом push и pull request (см. `.github/workflows/ci.yml`).

### Способ 2: Использование Docker

```bash
# Создание Docker-образа
docker build -t wb-api-mcp-server .

# Запуск Docker-контейнера
docker run -p 3000:3000 -d --name wb-api-mcp wb-api-mcp-server
```

### Способ 3: Использование Docker Compose

```bash
cp .env.example .env
# Запуск сервера с Docker Compose
docker-compose up -d

# Остановка сервера
docker-compose down
```

### Способ 4: Готовый образ из GitHub Container Registry

При каждом push в `main` GitHub Actions автоматически собирает и публикует образ (см. `.github/workflows/docker-publish.yml`):

```bash
docker pull ghcr.io/ВАШ_ЛОГИН/wb-api-mcp-server:latest
docker run -p 3000:3000 -d --name wb-api-mcp ghcr.io/ВАШ_ЛОГИН/wb-api-mcp-server:latest
```

### Проверка установки

Вы можете проверить, что сервер работает правильно, отправив запрос к эндпоинту проверки работоспособности:

```bash
curl http://localhost:3000/health
```

Вы должны получить ответ, подобный следующему:

```json
{
  "status": "ok",
  "timestamp": "2023-05-21T12:34:56.789Z"
}
```

## Доступные инструменты API

MCP сервер предоставляет следующие группы эндпоинтов:

### 1. Статистика продвижения (Promotion Statistics)

- **POST /api/adv/fullstats** - Статистика рекламных кампаний
- **GET /api/adv/auto/stat-words** - Статистика автоматической кампании по кластерам ключевых фраз
- **GET /api/adv/stat/words** - Статистика кампаний по ключевым фразам
- **GET /api/adv/stats/keywords** - Статистика по ключевым словам для автоматических кампаний
- **POST /api/adv/stats** - Статистика медийных кампаний

### 2. Воронка продаж (Sales Funnel)

- **POST /api/nm-report/detail** - Получение статистики карточек товаров за период
- **POST /api/nm-report/detail/history** - Получение статистики карточек товаров по дням
- **POST /api/nm-report/grouped/history** - Получение статистики карточек товаров, сгруппированных по категориям, брендам и тегам

### 3. Поисковые запросы (Search Queries)

- **POST /api/search-report/report** - Получение данных основного отчета по поисковым запросам
- **POST /api/search-report/table/groups** - Получение пагинации по группам для поисковых запросов
- **POST /api/search-report/table/details** - Получение пагинации по товарам внутри группы
- **POST /api/search-report/product/search-texts** - Получение поисковых текстов по товару
- **POST /api/search-report/product/orders** - Получение заказов и позиций по поисковым текстам товара

### 4. Отчет по остаткам (Stocks Report)

- **POST /api/stocks-report/products/groups** - Получение данных по группам товаров для отчета по остаткам
- **POST /api/stocks-report/products/products** - Получение данных по товарам для отчета по остаткам
- **POST /api/stocks-report/products/sizes** - Получение данных по размерам для отчета по остаткам
- **POST /api/stocks-report/offices** - Получение данных по складам для отчета по остаткам

### 5. CSV-отчеты продавца (Seller Analytics CSV)

- **POST /api/nm-report/downloads** - Создание CSV-отчета
- **GET /api/nm-report/downloads** - Получение списка отчетов
- **POST /api/nm-report/downloads/retry** - Повторная генерация отчета
- **GET /api/nm-report/downloads/file/:downloadId** - Получение файла отчета

### 6. Импорт данных EVIRMA PRO

- **POST /api/evirma/import/keywords-report** — импорт отчёта «Статистика РК по ключевым фразам» (multipart/form-data, поле `file`, .xlsx/.xls)
- **POST /api/evirma/import/daily-zone-stats** — импорт отчёта «Статистика РК по дням и зонам показов» (multipart/form-data, поле `file`, .xlsx/.xls)

## Импорт отчётов EVIRMA PRO

[EVIRMA PRO](https://chrome.evirma.ru/pro) — платное расширение для Chrome (699₽/мес) с расширенной аналитикой рекламы Wildberries, включая данные официальной подписки WB «Джем». У EVIRMA нет публичного API — данные можно только экспортировать вручную из интерфейса плагина. Этот сервер принимает такую выгрузку и превращает её в структурированный JSON.

### Как получить файл

1. Откройте статистику рекламной кампании по ключевым фразам в EVIRMA PRO.
2. Экспортируйте таблицу (кнопка экспорта доступна только в PRO-версии).
3. Загрузите полученный `.xlsx`-файл в эндпоинт ниже.

### Пример запроса

```bash
curl -X POST http://localhost:3000/api/evirma/import/keywords-report \
  -H "api-key: ВАШ_ТОКЕН_WILDBERRIES_API" \
  -F "file=@Экспорт_..._cmp-advert-keywords-stats_....xlsx"
```

### Формат ответа

Каждая строка (ключевая фраза/кластер) возвращается со сгруппированными метриками — так же, как они сгруппированы в самой выгрузке EVIRMA:

```json
{
  "error": false,
  "source": "evirma-pro-keywords-report",
  "rowCount": 421,
  "data": [
    {
      "cluster": "5w40",
      "traffic": { "impressions": 250, "clicks": 9, "ctr": 3.6, "spend": 184, "...": "..." },
      "basketsAd": { "baskets": null, "cpl": null, "...": "..." },
      "ordersAd": { "orders": null, "revenue": null, "...": "..." },
      "jemForecast": { "baskets": null, "orders": null, "...": "..." },
      "jemTraffic": { "avgPosition": 98, "visibility": 100, "...": "..." },
      "jemBaskets": { "baskets": null, "...": "..." },
      "jemOrders": { "orders": null, "revenue": null, "...": "..." }
    }
  ]
}
```

Группы `jemForecast`, `jemTraffic`, `jemBaskets`, `jemOrders` содержат данные из подписки WB «Джем» (весь трафик, не только рекламный) — они присутствуют в выгрузке, только если у вас подключена подписка «Джем» на Wildberries.

**Важно:** маппинг колонок (`lib/evirmaKeywordsParser.js`) привязан к точной структуре конкретного отчёта EVIRMA по состоянию на август 2026. Если разработчик EVIRMA изменит формат экспорта, потребуется обновить `COLUMN_MAP` в этом файле под новую структуру.

### Отчёт «Статистика РК по дням и зонам показов»

`POST /api/evirma/import/daily-zone-stats` парсит отчёт с разбивкой рекламной статистики по дням и по зонам показа (поиск/каталог). У каждого периода (итог за весь период + по одному на каждый день) есть три группы метрик — `ad` (реклама), `adEfficiency` (эффективность рекламы: корзины, заказы, ДРР) и `total` (весь трафик товара — реклама + органика) — плюс опциональная разбивка `zones.search` / `zones.catalog`, если для дня есть данные по этой зоне.

```bash
curl -X POST http://localhost:3000/api/evirma/import/daily-zone-stats \
  -H "api-key: ВАШ_ТОКЕН_WILDBERRIES_API" \
  -F "file=@Экспорт_..._wb_cmp_advert-stats_....xlsx"
```

```json
{
  "error": false,
  "source": "evirma-pro-daily-zone-stats",
  "rowCount": 27,
  "data": [
    {
      "period": "За период",
      "isSummary": true,
      "date": null,
      "weekday": null,
      "ad": { "impressions": 4578, "cpm": 756, "clicks": 298, "spend": 3460, "...": "..." },
      "adEfficiency": { "baskets": 33, "orders": 7, "revenue": 46403, "drrByRevenue": 7.46, "...": "..." },
      "total": { "views": 26984, "ordersTotal": 43, "revenueTotal": 286865, "...": "..." },
      "zones": {
        "search": { "sharePercent": 97, "ad": { "impressions": 4438, "...": "..." }, "adEfficiency": { "...": "..." } },
        "catalog": { "sharePercent": 3, "ad": { "impressions": 140, "...": "..." }, "adEfficiency": { "...": "..." } }
      }
    },
    {
      "period": "16.08.2026 / вс",
      "isSummary": false,
      "date": "2026-08-16",
      "weekday": "вс",
      "...": "..."
    }
  ]
}
```

**Важно:** `каталог` в `zones` может быть `null` — в выгрузке EVIRMA эта строка полностью отсутствует для дней без показов в каталоге (а не просто содержит нули). Маппинг колонок (`lib/evirmaDailyStatsParser.js`) так же привязан к текущему формату отчёта EVIRMA.

## Примеры использования

### Получение статистики рекламных кампаний

```javascript
// Использование fetch
const response = await fetch('http://localhost:3000/api/adv/fullstats', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-key': 'ВАШ_ТОКЕН_WILDBERRIES_API'
  },
  body: JSON.stringify([
    {
      "id": 8960367,
      "dates": [
        "2024-04-07",
        "2024-04-06"
      ]
    }
  ])
});

const data = await response.json();
console.log(data);
```

### Получение статистики карточек товаров

```javascript
// Использование axios
const axios = require('axios');

const response = await axios.post('http://localhost:3000/api/nm-report/detail', {
  "brandNames": ["ВашБренд"],
  "objectIDs": [358],
  "tagIDs": [123],
  "nmIDs": [1234567],
  "timezone": "Europe/Moscow",
  "period": {
    "begin": "2024-04-01 00:00:00",
    "end": "2024-04-15 23:59:59"
  },
  "orderBy": {
    "field": "ordersSumRub",
    "mode": "asc"
  },
  "page": 1
}, {
  headers: {
    'api-key': 'ВАШ_ТОКЕН_WILDBERRIES_API'
  }
});

console.log(response.data);
```

## Типичные сценарии использования

### 1. Мониторинг эффективности рекламных кампаний

**Сценарий:** Вы хотите регулярно отслеживать эффективность ваших рекламных кампаний и анализировать ключевые метрики.

**Решение с использованием MCP:**
1. Настройте ежедневную задачу, которая запрашивает статистику по всем активным кампаниям.
2. Сохраняйте полученные данные в базу данных для исторического анализа.
3. Создайте дашборд, отображающий ключевые метрики (CTR, конверсии, затраты).

**Пример кода:**
```javascript
// Получение статистики кампаний
const campaigns = [123456, 789012]; // ID ваших кампаний
const dates = [getDateString(new Date())]; // Сегодняшняя дата

// Формирование запроса
const requestData = campaigns.map(id => ({
  id: id,
  dates: dates
}));

// Отправка запроса к MCP серверу
const campaignStats = await fetchFromMcp('/api/adv/fullstats', 'POST', requestData);

// Сохранение данных и генерация отчета
saveToDatabaseAndGenerateReport(campaignStats);
```

### 2. Анализ воронки продаж товаров

**Сценарий:** Вы хотите анализировать, как пользователи взаимодействуют с вашими товарами от просмотра карточки до покупки.

**Решение с использованием MCP:**
1. Запрашивайте детальную статистику по товарам за выбранный период.
2. Анализируйте конверсии на каждом этапе (просмотр → добавление в корзину → заказ → выкуп).
3. Выявляйте товары с низкими конверсиями для оптимизации.

**Пример кода:**
```javascript
// Получение статистики воронки продаж
const response = await fetchFromMcp('/api/nm-report/detail', 'POST', {
  "nmIDs": [/* ваши номенклатуры */],
  "timezone": "Europe/Moscow",
  "period": {
    "begin": "2024-04-01 00:00:00",
    "end": "2024-04-30 23:59:59"
  },
  "page": 1
});

// Анализ конверсий
const products = response.data.cards;
const lowConversionProducts = products.filter(product => {
  const stats = product.statistics.selectedPeriod;
  return stats.conversions.addToCartPercent < 5 || 
         stats.conversions.cartToOrderPercent < 20 ||
         stats.conversions.buyoutsPercent < 80;
});

// Генерация отчета по проблемным товарам
generateLowConversionReport(lowConversionProducts);
```

### 3. Оптимизация поисковой видимости

**Сценарий:** Вы хотите улучшить видимость ваших товаров в поиске Wildberries.

**Решение с использованием MCP:**
1. Запрашивайте отчеты по поисковым запросам для своих товаров.
2. Анализируйте, по каким запросам ваши товары имеют хорошие позиции, а по каким - плохие.
3. Оптимизируйте карточки товаров для улучшения позиций.

**Пример кода:**
```javascript
// Получение отчета по поисковым запросам
const searchReport = await fetchFromMcp('/api/search-report/report', 'POST', {
  "currentPeriod": {
    "start": "2024-04-01",
    "end": "2024-04-30"
  },
  "positionCluster": "all",
  "orderBy": {
    "field": "avgPosition",
    "mode": "desc"
  },
  "limit": 100,
  "offset": 0
});

// Получение поисковых текстов для конкретного товара
const searchTexts = await fetchFromMcp('/api/search-report/product/search-texts', 'POST', {
  "currentPeriod": {
    "start": "2024-04-01",
    "end": "2024-04-30"
  },
  "nmIds": [1234567],
  "topOrderBy": "openCard",
  "limit": 20
});

// Анализ результатов и формирование рекомендаций
analyzeSearchPositionsAndGenerateRecommendations(searchTexts);
```

### 4. Управление запасами на основе аналитики

**Сценарий:** Вы хотите оптимизировать уровень запасов товаров на складах на основе данных о продажах.

**Решение с использованием MCP:**
1. Регулярно запрашивайте отчеты по остаткам и продажам.
2. Рассчитывайте оптимальный уровень запасов на основе скорости продаж.
3. Выявляйте товары с избыточными или недостаточными запасами.

**Пример кода:**
```javascript
// Получение отчета по остаткам
const stocksReport = await fetchFromMcp('/api/stocks-report/products/products', 'POST', {
  "nmIDs": [/* ваши номенклатуры */],
  "currentPeriod": {
    "start": "2024-04-01",
    "end": "2024-04-30"
  },
  "stockType": "",
  "skipDeletedNm": true,
  "orderBy": {
    "field": "avgOrders",
    "mode": "desc"
  },
  "offset": 0
});

// Анализ скорости продаж и остатков
const stockOptimizationReport = stocksReport.data.items.map(item => {
  const dailySales = item.metrics.avgOrders;
  const currentStock = item.metrics.stockCount;
  const daysOfSupply = currentStock / dailySales;
  
  return {
    nmId: item.nmID,
    name: item.name,
    dailySales,
    currentStock,
    daysOfSupply,
    stockStatus: daysOfSupply < 7 ? 'LOW' : daysOfSupply > 30 ? 'HIGH' : 'OPTIMAL'
  };
});

// Генерация рекомендаций по управлению запасами
generateStockManagementRecommendations(stockOptimizationReport);
```

### 5. Генерация и анализ расширенных CSV-отчетов

**Сценарий:** Вы хотите получить детальные данные для глубокого анализа в Excel или другом инструменте.

**Решение с использованием MCP:**
1. Создайте задачу на генерацию CSV-отчета через MCP.
2. Дождитесь завершения генерации и загрузите отчет.
3. Импортируйте данные в аналитические инструменты для анализа.

**Пример кода:**
```javascript
// Создание задачи на генерацию отчета
const reportId = generateUUID();
const createReportResponse = await fetchFromMcp('/api/nm-report/downloads', 'POST', {
  "id": reportId,
  "reportType": "DETAIL_HISTORY_REPORT",
  "userReportName": "Аналитика по товарам за апрель",
  "params": {
    "nmIDs": [/* ваши номенклатуры */],
    "startDate": "2024-04-01",
    "endDate": "2024-04-30",
    "timezone": "Europe/Moscow",
    "aggregationLevel": "day",
    "skipDeletedNm": false
  }
});

// Проверка статуса генерации (через некоторое время)
setTimeout(async () => {
  const reportStatusResponse = await fetchFromMcp('/api/nm-report/downloads', 'GET', {
    'filter[downloadIds]': [reportId]
  });
  
  const reportStatus = reportStatusResponse.data[0].status;
  
  if (reportStatus === 'SUCCESS') {
    // Загрузка отчета
    downloadReport(reportId);
  } else if (reportStatus === 'FAILED') {
    // Повторная попытка генерации
    retryReport(reportId);
  }
}, 60000); // Проверка через 1 минуту
```

## Получение токена API

Для работы с API Wildberries через MCP сервер вам потребуется токен API. Вот как его получить:

1. **Войдите в личный кабинет продавца Wildberries**

   Перейдите на [seller.wildberries.ru](https://seller.wildberries.ru/) и авторизуйтесь.

2. **Перейдите в раздел настроек API**

   После входа в систему перейдите в раздел "Настройки" (обычно доступен из меню или профиля).

3. **Перейдите в раздел управления API**

   Найдите раздел "API" или "Доступ к API" или "Интеграция".

4. **Создайте новый токен API**

   - Нажмите "Создать новый токен" или аналогичную кнопку
   - Выберите необходимые права доступа для токена:
     - Для MCP сервера WB API вам потребуются:
       - Разрешение категории **Аналитика** для воронки продаж и поисковых запросов
       - Разрешение категории **Продвижение** для статистики рекламы
   - Укажите имя для токена (для вашего удобства)
   - При необходимости установите срок действия (или оставьте постоянным)

5. **Сгенерируйте и сохраните токен**

   После заполнения необходимой информации нажмите "Сгенерировать" или "Создать" для генерации токена API.

   **ВАЖНО**: Обязательно скопируйте и надежно сохраните ваш токен! Полный токен будет показан только один раз в целях безопасности.

## Устранение неполадок

### Частые проблемы

1. **Отказ в соединении**: Убедитесь, что сервер запущен и порт доступен.
2. **Ошибки аутентификации**: Проверьте, что ваш токен API Wildberries действителен и имеет необходимые разрешения.
3. **Ограничение частоты запросов**: Сервер обрабатывает ограничения частоты запросов API Wildberries, но вам может потребоваться подождать, если вы превысили допустимое количество запросов.

### Просмотр логов

При запуске с Docker или Docker Compose логи хранятся в директории `logs`, которая подключена как том.

Для просмотра логов в работающем Docker-контейнере:

```bash
docker logs wb-api-mcp
```

### Коды ошибок

- **401** - Ошибка аутентификации (проверьте ваш токен API)
- **429** - Превышение лимита запросов (подождите некоторое время)
- **400** - Неверный запрос (проверьте параметры запроса)
- **403** - Доступ запрещен (проверьте разрешения вашего токена)

## Деплой на Cloudflare Workers

Сервер также можно развернуть как Cloudflare Worker (через `wrangler deploy` или автодеплой из GitHub в Cloudflare Dashboard) — Cloudflare с 2026 года официально поддерживает запуск Express-приложений на Workers через адаптер `cloudflare:node`. За это отвечают два файла: `wrangler.jsonc` (конфигурация) и `worker-entry.mjs` (точка входа-обёртка). Обычный запуск через `npm start`/Docker их не использует и не требует.

```bash
npm run deploy:cloudflare
# или напрямую:
npx wrangler deploy
```

**Требования:** Node.js ≥20 в окружении сборки (в Cloudflare Dashboard задаётся автоматически по `.nvmrc`, либо переменной `NODE_VERSION` в Settings → Build).

**Важные ограничения по сравнению с Docker/обычным Node-хостингом:**
- Rate limiting (`express-rate-limit`) хранит счётчики в памяти процесса. На Workers изоляты периодически пересоздаются, поэтому лимит запросов может сбрасываться чаще, чем на постоянно работающем сервере — для строгого лимитирования на проде рекомендуется Cloudflare Rate Limiting Rules на уровне платформы вместо (или вместе с) `express-rate-limit`.
- CPU-время на запрос ограничено тарифом Cloudflare (особенно на бесплатном плане) — парсинг больших `.xlsx`-файлов через `/api/evirma/import/*` может упереться в лимит на действительно больших выгрузках.
- Загруженные файлы (`multer`) обрабатываются только в памяти запроса — это уже было так и на Docker, здесь ничего не меняется.

Если нужен полностью предсказуемый Node-рантайм без таких оговорок — используйте обычный Docker-деплой (см. выше), для которого сервер и был написан изначально.

## Безопасность и продакшн-эксплуатация

- **HTTPS обязателен в проде.** Сервер сам по себе не терминирует TLS — разверните за reverse-proxy (nginx, Caddy, Cloudflare Tunnel и т.п.), иначе токен `api-key` будет передаваться в открытом виде.
- **Токен нигде не хранится на сервере** — он передаётся клиентом в заголовке `api-key` на каждый запрос и используется только для проксирования в Wildberries API.
- **`/health` не требует авторизации** — предназначен для мониторинга и Docker/Kubernetes healthcheck'ов и не отдаёт чувствительных данных.
- **Rate limiting** — встроенный лимит `RATE_LIMIT_MAX` запросов в минуту с одного IP защищает от случайных burst-запросов к Wildberries API.
- **Автоматическое сканирование зависимостей и кода** — Dependabot (npm/Docker/Actions) и CodeQL запускаются еженедельно и при каждом PR (см. `.github/`).
- Контейнер запускается от непривилегированного пользователя (`appuser`), не от root.
- **Загрузка файлов** (`/api/evirma/import/keywords-report`) ограничена размером 15 МБ и расширениями `.xlsx`/`.xls`; файл обрабатывается только в памяти (не сохраняется на диск).
