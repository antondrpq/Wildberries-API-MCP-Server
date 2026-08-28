require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.MCP_PORT || 3001);
const WB_API_KEY = process.env.WB_API_KEY || '';
const MCP_API_KEY = process.env.MCP_API_KEY || '';
const MCP_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-11-25';

const API_URLS = {
  ADVERT: 'https://advert-api.wildberries.ru',
  ANALYTICS: 'https://seller-analytics-api.wildberries.ru',
  FINANCE: 'https://finance-api.wildberries.ru',
  FEEDBACKS: 'https://feedbacks-api.wildberries.ru',
  CHAT: 'https://buyer-chat-api.wildberries.ru',
  COMMON: 'https://common-api.wildberries.ru',
  MARKETPLACE: 'https://marketplace-api.wildberries.ru'
};

// Max number of rrdId-paginated pages wb_finance_summary will follow before
// stopping, as a safety valve against runaway loops on very large periods.
const FINANCE_SUMMARY_MAX_PAGES = Number(process.env.FINANCE_SUMMARY_MAX_PAGES || 50);

// WB advertising campaign statuses (adv/v1/promotion/count), used by
// wb_ads_summary to decide which campaigns to pull stats for.
const ADV_ACTIVE_STATUSES = [9, 11]; // 9 = active, 11 = paused
const ADV_SUMMARY_MAX_CAMPAIGNS = Number(process.env.ADV_SUMMARY_MAX_CAMPAIGNS || 50);

const DATE_SCHEMA = {
  type: 'object',
  properties: {
    start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
  },
  required: ['start', 'end'],
  additionalProperties: false
};

const ORDER_BY_SCHEMA = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    mode: { type: 'string', enum: ['asc', 'desc'] }
  },
  required: ['field', 'mode'],
  additionalProperties: false
};

const STOCKS_BODY_SCHEMA = {
  type: 'object',
  properties: {
    nmIDs: { type: 'array', items: { type: 'integer' } },
    subjectID: { type: 'integer' },
    brandName: { type: 'string' },
    tagID: { type: 'integer' },
    currentPeriod: DATE_SCHEMA,
    stockType: { type: 'string', enum: ['', 'wb', 'mp'] },
    skipDeletedNm: { type: 'boolean' },
    orderBy: ORDER_BY_SCHEMA,
    availabilityFilters: {
      type: 'array',
      items: { type: 'string', enum: ['deficient', 'actual', 'balanced', 'nonActual', 'nonLiquid', 'invalidData'] }
    },
    limit: { type: 'integer', minimum: 1, maximum: 1000 }
  },
  required: ['currentPeriod', 'stockType', 'skipDeletedNm', 'orderBy', 'availabilityFilters'],
  additionalProperties: false
};

// WB finance endpoints accept a date (YYYY-MM-DD) or a full RFC3339
// date-time; both are used in the wild depending on the integration.
const FINANCE_DATETIME_PATTERN =
  '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z)?)?$';

const FINANCE_PERIOD_SCHEMA = {
  type: 'string',
  enum: ['daily', 'weekly'],
  default: 'weekly',
  description: 'Report granularity: daily or weekly reports.'
};

const SALES_REPORT_DETAILED_SCHEMA = {
  type: 'object',
  properties: {
    dateFrom: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report start date/time, Moscow time (UTC+3).' },
    dateTo: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report end date/time, Moscow time (UTC+3).' },
    limit: { type: 'integer', minimum: 1, maximum: 100000, default: 100000 },
    rrdId: { type: 'integer', minimum: 0, default: 0, description: 'Pagination cursor: pass the rrdId of the last row from the previous page. Start at 0.' },
    period: FINANCE_PERIOD_SCHEMA,
    fields: { type: 'array', items: { type: 'string' }, description: 'Optional subset of response fields to return; all fields are returned if omitted.' }
  },
  required: ['dateFrom', 'dateTo'],
  additionalProperties: false
};

const FEEDBACKS_QUESTIONS_LIST_SCHEMA = {
  type: 'object',
  properties: {
    isAnswered: { type: 'boolean', description: 'true = only processed/answered, false = only unprocessed/unanswered.' },
    nmId: { type: 'integer', description: 'Filter to one Wildberries product nmId.' },
    take: { type: 'integer', minimum: 1, description: 'How many items to return.' },
    skip: { type: 'integer', minimum: 0, description: 'How many items to skip (pagination offset).' },
    order: { type: 'string', enum: ['dateAsc', 'dateDesc'] },
    dateFrom: { type: 'integer', description: 'Period start, Unix timestamp (seconds).' },
    dateTo: { type: 'integer', description: 'Period end, Unix timestamp (seconds).' }
  },
  required: ['isAnswered', 'take', 'skip'],
  additionalProperties: false
};

const AD_PARAMS_SCHEMA = {
  type: 'object',
  properties: {
    ids: { type: 'string', description: 'Comma-separated campaign IDs; maximum 50.' },
    beginDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
  },
  required: ['ids', 'beginDate', 'endDate'],
  additionalProperties: true
};

const tools = [
  {
    name: 'wb_sales_funnel',
    title: 'WB Sales Funnel',
    description: 'Get Wildberries product sales funnel statistics for one or more nmIDs and a selected date range.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 1000, description: 'Wildberries product nmIDs.' },
        start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Period start date, YYYY-MM-DD.' },
        end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Period end date, YYYY-MM-DD.' },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
        offset: { type: 'integer', minimum: 0 }
      },
      required: ['nmIds', 'start', 'end'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_funnel_history',
    title: 'WB Sales Funnel History',
    description: 'Get daily Wildberries sales funnel statistics for selected products.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 1000 },
        start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        aggregationLevel: { type: 'string', enum: ['day', 'week', 'month'] }
      },
      required: ['nmIds', 'start', 'end'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_search_texts',
    title: 'WB Product Search Texts',
    description: 'Get Wildberries search queries associated with a product for a selected period. Jam subscription is required by Wildberries for this endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        nmIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 50 },
        start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        topOrderBy: { type: 'string', enum: ['openCard', 'addToCart', 'openToCart', 'orders', 'cartToOrder'], default: 'openCard' },
        includeSubstitutedSKUs: { type: 'boolean', default: true },
        includeSearchTexts: { type: 'boolean', default: true },
        orderBy: ORDER_BY_SCHEMA,
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum 30 on Standard tariff; up to 100 on higher tiers according to WB API access.' }
      },
      required: ['nmIds', 'start', 'end'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_stocks',
    title: 'WB Stocks',
    description: 'Get Wildberries product stock report data from POST /api/v2/stocks-report/products/products.',
    inputSchema: {
      type: 'object',
      properties: {
        body: STOCKS_BODY_SCHEMA
      },
      required: ['body'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_ad_campaign_stats',
    title: 'WB Advertising Campaign Stats',
    description: 'Get Wildberries advertising campaign statistics from GET /adv/v3/fullstats. Maximum requested period is 31 days and up to 50 campaign IDs are supported.',
    inputSchema: {
      type: 'object',
      properties: {
        params: AD_PARAMS_SCHEMA
      },
      required: ['params'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_account_balance',
    title: 'WB Account Balance',
    description: 'Get the Wildberries seller account balance widget data from GET /api/v1/account/balance: current balance and amount available for withdrawal. Requires a token with the Finance category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_report_list',
    title: 'WB Sales (Realization) Report List',
    description: 'Get the list of Wildberries sales/realization reports for a period from POST /api/finance/v1/sales-reports/list, with per-report totals (retail amount, amount for pay, logistics, storage, penalties, deductions, bank payment, etc). Data available from 1 January 2025. Requires a token with the Finance category.',
    inputSchema: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report start date/time, Moscow time (UTC+3).' },
        dateTo: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Report end date/time, Moscow time (UTC+3).' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 1000 },
        offset: { type: 'integer', minimum: 0, default: 0 },
        period: FINANCE_PERIOD_SCHEMA
      },
      required: ['dateFrom', 'dateTo'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_report_detailed',
    title: 'WB Sales (Realization) Report Detailed',
    description: 'Get line-item detail for Wildberries sales/realization reports over a period from POST /api/finance/v1/sales-reports/detailed: one row per sale/return/penalty/deduction event with commission, logistics, storage, acquiring fee, and payout fields. Data available from 29 January 2024. Paginate with rrdId (start at 0, pass the last row\'s rrdId to get the next page, stop when the response is empty). This replaces the deprecated GET /api/v5/supplier/reportDetailByPeriod. Requires a token with the Finance category.',
    inputSchema: SALES_REPORT_DETAILED_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_sales_report_detailed_by_id',
    title: 'WB Sales (Realization) Report Detailed by Report ID',
    description: 'Get line-item detail for one specific Wildberries sales/realization report from POST /api/finance/v1/sales-reports/detailed/{reportId}, identified by reportId (from wb_sales_report_list). Paginate with rrdId the same way as wb_sales_report_detailed. Requires a token with the Finance category.',
    inputSchema: {
      type: 'object',
      properties: {
        reportId: { type: 'integer', description: 'Report ID from wb_sales_report_list.' },
        limit: { type: 'integer', minimum: 1, maximum: 100000, default: 100000 },
        rrdId: { type: 'integer', minimum: 0, default: 0 },
        fields: { type: 'array', items: { type: 'string' } }
      },
      required: ['reportId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_acquiring_detailed',
    title: 'WB Acquiring (Payment Processing) Fees Detailed',
    description: 'Get line-item detail of Wildberries payment-processing (acquiring) fees for a period from POST /api/finance/v1/acquiring/detailed. This is a separate cost from the commission/logistics figures in the sales report. Russian sellers only. Paginate with rrdId the same way as wb_sales_report_detailed. Requires a Personal or Service token with the Finance category.',
    inputSchema: SALES_REPORT_DETAILED_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_finance_summary',
    title: 'WB Finance P&L Summary (aggregated)',
    description: 'High-level financial summary for a period, built by automatically paginating POST /api/finance/v1/sales-reports/detailed server-side and aggregating the results. Returns total revenue (forPay), WB commission, logistics, storage, acceptance, penalties, deductions, acquiring fees, and a per-nmId breakdown of the top items by revenue. Use this instead of wb_sales_report_detailed when you just need the totals rather than every raw row. Requires a token with the Finance category.',
    inputSchema: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', pattern: FINANCE_DATETIME_PATTERN },
        dateTo: { type: 'string', pattern: FINANCE_DATETIME_PATTERN },
        period: FINANCE_PERIOD_SCHEMA,
        topN: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'How many top nmIds by revenue to include in the breakdown.' }
      },
      required: ['dateFrom', 'dateTo'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_adv_campaigns_count',
    title: 'WB Ad Campaigns Count/List',
    description: 'Get the seller\'s advertising campaign IDs from GET /adv/v1/promotion/count, grouped by campaign type and status (active, paused, ready to launch, completed, etc), each with its last-changed date. Use this first to discover which campaign IDs exist before calling other ad tools. Requires a token with the Promotion category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_adv_campaigns_info',
    title: 'WB Ad Campaigns Info',
    description: 'Get details (name, dates, type, payment type, budget settings) for up to 50 advertising campaigns from GET /api/advert/v2/adverts, filtered by campaign IDs, statuses, and/or payment type. Requires a token with the Promotion category.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'string', description: 'Comma-separated campaign IDs, maximum 50, e.g. "12345,23456".' },
        statuses: { type: 'string', description: 'Comma-separated campaign status codes: -1 deleted, 4 ready to launch, 7 completed, 8 cancelled, 9 active, 11 paused.' },
        paymentType: { type: 'string', enum: ['cpm', 'cpc'] }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_adv_balance',
    title: 'WB Ad Account Balance',
    description: 'Get the Wildberries Promotion cabinet balance from GET /adv/v1/balance: the deposited account balance, the netting balance (max amount payable via offset against future sales), and bonus funds. Requires a token with the Promotion category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_adv_budget',
    title: 'WB Ad Campaign Budget',
    description: 'Get the spending budget (max campaign spend cap) for one advertising campaign from GET /adv/v1/budget. Requires a token with the Promotion category.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Campaign ID.' }
      },
      required: ['id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_adv_bids_recommendations',
    title: 'WB Ad Bids Recommendations',
    description: 'Get recommended bids for a product card and search clusters within a campaign from GET /api/advert/v0/bids/recommendations. Works for cpm (per-impression) and cpc (per-click) campaigns. Requires a token with the Promotion category.',
    inputSchema: {
      type: 'object',
      properties: {
        nmId: { type: 'integer', description: 'Wildberries product nmId.' },
        advertId: { type: 'integer', description: 'Campaign ID.' }
      },
      required: ['nmId', 'advertId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_ads_summary',
    title: 'WB Advertising Summary (aggregated)',
    description: 'High-level advertising overview for a date range, built server-side: discovers active/paused campaigns via wb_adv_campaigns_count, pulls their stats via GET /adv/v3/fullstats (chunked into batches of up to 50 campaigns), and returns the ad account balance plus per-campaign and total views/clicks/CTR/spend/orders/CR. Maximum requested period is 31 days. Use this instead of wb_ad_campaign_stats when you want the whole ad account picture rather than a manually chosen list of campaign IDs. Requires tokens with the Promotion category.',
    inputSchema: {
      type: 'object',
      properties: {
        beginDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        includeStatuses: {
          type: 'array',
          items: { type: 'integer', enum: [4, 7, 8, 9, 11] },
          default: [9, 11],
          description: 'Which campaign statuses to include (default: active=9 and paused=11).'
        }
      },
      required: ['beginDate', 'endDate'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_feedbacks_questions_unread',
    title: 'WB Unread Feedbacks/Questions Flag',
    description: 'Check whether the seller has any unread customer questions or feedbacks (reviews) from GET /api/v1/new-feedbacks-questions. Returns hasNewQuestions/hasNewFeedbacks booleans. Requires a token with the Feedbacks and Questions category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_feedbacks_list',
    title: 'WB Feedbacks (Reviews) List',
    description: 'Get a filtered, paginated list of Wildberries product reviews from GET /api/v1/feedbacks. A review counts as processed if it has an answer, or has only a star rating with no text/photo. Requires a token with the Feedbacks and Questions category.',
    inputSchema: FEEDBACKS_QUESTIONS_LIST_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_feedback_answer',
    title: 'WB Answer a Feedback (Review)',
    description: 'Post a public reply to a customer product review via POST /api/v1/feedbacks/answer, or edit an already-sent reply via PATCH (set edit=true; edits are allowed only once, within 60 days of the original answer). The review ID is not validated by Wildberries: a wrong ID silently does nothing. This posts customer-visible text — review it carefully before calling. Requires a token with the Feedbacks and Questions category.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Feedback (review) ID.' },
        text: { type: 'string', minLength: 2, maxLength: 5000, description: 'Reply text shown publicly to the customer.' },
        edit: { type: 'boolean', default: false, description: 'true to edit an existing reply instead of posting a new one.' }
      },
      required: ['id', 'text'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'wb_questions_list',
    title: 'WB Customer Questions List',
    description: 'Get a filtered, paginated list of customer questions about products from GET /api/v1/questions (up to 10000 per response; take+skip must not exceed 10000). Requires a token with the Feedbacks and Questions category.',
    inputSchema: FEEDBACKS_QUESTIONS_LIST_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_question_view',
    title: 'WB Mark Question as Viewed',
    description: 'Mark a customer question as viewed via PATCH /api/v1/questions with {id, wasViewed: true}. Requires a token with the Feedbacks and Questions category.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Question ID.' }
      },
      required: ['id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_question_answer',
    title: 'WB Answer a Customer Question',
    description: 'Post (or, with edit=true, edit within 60 days) a public reply to a customer product question via PATCH /api/v1/questions with {id, answer: {text}}. All seller answers go through WB moderation before publishing. This posts customer-visible text — review it carefully before calling. Requires a token with the Feedbacks and Questions category. Note: rejecting a question (marking it inappropriate) is not exposed by this tool because its exact request schema could not be confirmed from the documentation on hand; ask if that is needed.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Question ID.' },
        text: { type: 'string', minLength: 1, description: 'Answer text shown publicly to the customer, pending WB moderation.' }
      },
      required: ['id', 'text'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'wb_chats_list',
    title: 'WB Buyer Chats List',
    description: 'Get the list of all the seller\'s buyer chats from GET /api/v1/seller/chats. Use the chat data to fetch events (wb_chat_events) or reply (wb_chat_send_message). Requires a token with the Questions and Feedbacks / Chat with buyers category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_chat_events',
    title: 'WB Buyer Chat Events',
    description: 'Get chat events (new messages, etc) across all buyer chats from GET /api/v1/seller/events. Call once without next, then repeat passing the next value from the previous response until totalEvents is 0. Requires a token with the Chat with buyers category.',
    inputSchema: {
      type: 'object',
      properties: {
        next: { type: 'integer', description: 'Pagination cursor: Unix timestamp in milliseconds from the previous response. Omit for the first call.' }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_chat_send_message',
    title: 'WB Send Buyer Chat Message',
    description: 'Send a text message to a customer in a buyer chat via POST /api/v1/seller/message (multipart/form-data). replySign comes from wb_chats_list or from a chat event with "isNewChat": true. This sends a customer-visible message immediately — review the text carefully before calling. File attachments are not supported by this tool. Requires a token with the Chat with buyers category.',
    inputSchema: {
      type: 'object',
      properties: {
        replySign: { type: 'string', maxLength: 255, description: 'Chat signature from wb_chats_list or a chat event.' },
        message: { type: 'string', maxLength: 1000, description: 'Message text, max 1000 characters.' }
      },
      required: ['replySign', 'message'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'wb_tariffs_commission',
    title: 'WB Commission Tariffs',
    description: 'Get Wildberries commission percentages by parent product category from GET /api/v1/tariffs/commission. Works with a token of any category. Use this for pricing and margin decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        locale: { type: 'string', enum: ['ru', 'en', 'zh'], default: 'ru', description: 'Language for parentName/subjectName in the response.' }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_tariffs_box',
    title: 'WB Box/Supersafe Logistics & Storage Tariffs',
    description: 'Get daily Wildberries logistics and storage tariffs (delivery to/from customer, warehouse storage) for goods shipped in boxes from GET /api/v1/tariffs/box, for a given date. Box tariffs are the same as Supersafe tariffs. Works with a token of any category.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Date in YYYY-MM-DD format.' }
      },
      required: ['date'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_orders_new',
    title: 'WB New FBS Orders',
    description: 'Get all new FBS assembly orders (sborochnye zadaniya) awaiting action from GET /api/v3/orders/new. Requires a token with the Marketplace category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_orders_status',
    title: 'WB FBS Order Statuses',
    description: 'Get supplierStatus (seller-driven: new/confirm/complete/cancel) and wbStatus (WB system status) for up to 1000 FBS orders by ID from POST /api/v3/orders/status. Also indicates whether each order is still cancellable. Requires a token with the Marketplace category.',
    inputSchema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: { type: 'integer' },
          minItems: 1,
          maxItems: 1000,
          description: 'FBS order (assembly task) IDs.'
        }
      },
      required: ['orders'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_order_cancel',
    title: 'WB Cancel FBS Order',
    description: 'Cancel one FBS order (assembly task) via PATCH /api/v3/orders/{orderId}/cancel, moving it to the "cancel" (cancelled by seller) status. Only possible before the order has been handed over to Wildberries — check isCancellable via wb_orders_status first. This is an irreversible customer-facing action: the customer\'s order gets cancelled. Confirm with the person before calling this. Requires a token with the Marketplace category.',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'integer', description: 'FBS order (assembly task) ID.' }
      },
      required: ['orderId'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'wb_business_summary',
    title: 'WB Store Manager Business Summary (aggregated)',
    description: 'Cross-functional store-health snapshot for a date range, built server-side by combining: wb_finance_summary (P&L), wb_ads_summary (advertising spend/performance), and wb_orders_new (FBS orders awaiting action). Use this for a top-level "how is the business doing" check instead of calling each tool separately. Does NOT include stock levels — call wb_stocks separately for that, since it needs a sort field choice this tool does not assume for you. Requires tokens with the Finance, Promotion, and Marketplace categories.',
    inputSchema: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Financial period start.' },
        dateTo: { type: 'string', pattern: FINANCE_DATETIME_PATTERN, description: 'Financial period end.' },
        adsBeginDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Advertising period start (max 31 days); defaults to dateFrom truncated to a date.' },
        adsEndDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Advertising period end; defaults to dateTo truncated to a date.' }
      },
      required: ['dateFrom', 'dateTo'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }
];

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

function auth(req, res, next) {
  if (!MCP_API_KEY) return next();
  const bearer = req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '');
  const supplied = req.headers['x-mcp-api-key'] || bearer;
  if (supplied !== MCP_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function getWbKey() {
  if (!WB_API_KEY) {
    const error = new Error('WB_API_KEY is not configured on the MCP server');
    error.statusCode = 500;
    throw error;
  }
  return WB_API_KEY;
}

async function callWb(url, method, data) {
  const response = await axios({
    method,
    url,
    data: method === 'GET' ? undefined : data,
    params: method === 'GET' ? data : undefined,
    headers: { Authorization: getWbKey() },
    validateStatus: () => true,
    timeout: Number(process.env.WB_REQUEST_TIMEOUT_MS || 60000)
  });

  if (response.status >= 200 && response.status < 300) return response.data;

  const error = new Error(`Wildberries API returned HTTP ${response.status}`);
  error.statusCode = response.status;
  error.details = response.data;
  error.retryAfter = response.headers['x-ratelimit-retry'] || response.data?.retryAfter || null;
  throw error;
}

// The chat message endpoint requires multipart/form-data, unlike every other
// WB endpoint this server proxies (all JSON), so it needs a separate path
// using the global fetch/FormData (Node >=20) instead of the axios JSON helper.
async function callWbMultipart(url, fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, value);
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.WB_REQUEST_TIMEOUT_MS || 60000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: getWbKey() },
      body: form,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);

  if (response.ok) return body;

  const error = new Error(`Wildberries API returned HTTP ${response.status}`);
  error.statusCode = response.status;
  error.details = body;
  throw error;
}

function requireDateRange(args) {
  if (!Array.isArray(args.nmIds) || args.nmIds.length === 0) throw new Error('nmIds must be a non-empty array');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.start) || !/^\d{4}-\d{2}-\d{2}$/.test(args.end)) {
    throw new Error('start and end must use YYYY-MM-DD format');
  }
}

function requireStocksBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
  const required = ['currentPeriod', 'stockType', 'skipDeletedNm', 'orderBy', 'availabilityFilters'];
  const missing = required.filter(key => body[key] === undefined);
  if (missing.length) throw new Error(`body is missing required fields: ${missing.join(', ')}`);
  if (!body.currentPeriod || !/^\d{4}-\d{2}-\d{2}$/.test(body.currentPeriod.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.currentPeriod.end)) {
    throw new Error('body.currentPeriod.start/end must use YYYY-MM-DD format');
  }
}

function requireAdParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('params must be an object');
  if (!params.ids || !String(params.ids).trim()) throw new Error('params.ids is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.beginDate) || !/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
    throw new Error('params.beginDate and params.endDate must use YYYY-MM-DD format');
  }
  const ids = String(params.ids).split(',').map(value => value.trim()).filter(Boolean);
  if (ids.length > 50) throw new Error('params.ids supports a maximum of 50 campaign IDs');
}

function requireFinanceDateRange(args) {
  const pattern = new RegExp(FINANCE_DATETIME_PATTERN);
  if (!pattern.test(args.dateFrom) || !pattern.test(args.dateTo)) {
    throw new Error('dateFrom and dateTo must be YYYY-MM-DD or RFC3339 date-time strings');
  }
}

// Numeric fields in the sales-reports/detailed response that make up a P&L:
// WB returns money fields as strings, so everything is parsed with Number().
const FINANCE_SUMMARY_FIELDS = {
  retailAmount: 'revenueRetailAmount',
  forPay: 'payoutForPay',
  ppvzSalesCommission: 'commissionAmount',
  deliveryRub: 'logisticsAmount',
  paidStorage: 'storageAmount',
  paidAcceptance: 'acceptanceAmount',
  penalty: 'penaltyAmount',
  deduction: 'deductionAmount',
  additionalPayment: 'additionalPaymentAmount',
  acquiringFee: 'acquiringFeeAmount'
};

function toNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchAllSalesReportDetailed({ dateFrom, dateTo, period }) {
  const rows = [];
  let rrdId = 0;
  let truncated = false;

  for (let page = 0; page < FINANCE_SUMMARY_MAX_PAGES; page += 1) {
    const pageRows = await callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/detailed`, 'POST', {
      dateFrom,
      dateTo,
      limit: 100000,
      rrdId,
      period: period || 'weekly'
    });

    if (!Array.isArray(pageRows) || pageRows.length === 0) break;

    rows.push(...pageRows);
    rrdId = pageRows[pageRows.length - 1].rrdId;

    if (page === FINANCE_SUMMARY_MAX_PAGES - 1) truncated = true;
  }

  return { rows, truncated };
}

function aggregateFinanceSummary(rows, topN) {
  const totals = Object.fromEntries(Object.values(FINANCE_SUMMARY_FIELDS).map(key => [key, 0]));
  const byNmId = new Map();

  for (const row of rows) {
    for (const [wbField, summaryKey] of Object.entries(FINANCE_SUMMARY_FIELDS)) {
      totals[summaryKey] += toNumber(row[wbField]);
    }

    const nmId = row.nmId;
    if (nmId === undefined || nmId === null) continue;

    if (!byNmId.has(nmId)) {
      byNmId.set(nmId, {
        nmId,
        title: row.title || null,
        vendorCode: row.vendorCode || null,
        subjectName: row.subjectName || null,
        quantity: 0,
        revenueForPay: 0
      });
    }
    const entry = byNmId.get(nmId);
    entry.quantity += toNumber(row.quantity);
    entry.revenueForPay += toNumber(row.forPay);
  }

  const topByNmId = Array.from(byNmId.values())
    .sort((a, b) => b.revenueForPay - a.revenueForPay)
    .slice(0, topN);

  return { totals, topByNmId, uniqueNmIdCount: byNmId.size };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function fetchAdsSummary({ beginDate, endDate, includeStatuses }) {
  const [countRes, balanceRes] = await Promise.all([
    callWb(`${API_URLS.ADVERT}/adv/v1/promotion/count`, 'GET'),
    callWb(`${API_URLS.ADVERT}/adv/v1/balance`, 'GET')
  ]);

  const statuses = includeStatuses && includeStatuses.length ? includeStatuses : ADV_ACTIVE_STATUSES;
  const advertGroups = Array.isArray(countRes?.adverts) ? countRes.adverts : [];
  const campaignIds = [];
  for (const group of advertGroups) {
    if (!statuses.includes(group.status)) continue;
    for (const advert of group.advert_list || group.advertList || []) {
      const id = advert.advertId ?? advert.id;
      if (id !== undefined) campaignIds.push(id);
    }
  }

  const limitedIds = campaignIds.slice(0, ADV_SUMMARY_MAX_CAMPAIGNS);
  const truncated = campaignIds.length > limitedIds.length;

  const statsChunks = await Promise.all(
    chunk(limitedIds, 50).map(ids =>
      callWb(`${API_URLS.ADVERT}/adv/v3/fullstats`, 'GET', { ids: ids.join(','), beginDate, endDate })
    )
  );
  const perCampaign = statsChunks.flat();

  const totals = { views: 0, clicks: 0, sum: 0, orders: 0, atbs: 0 };
  for (const campaign of perCampaign) {
    const days = Array.isArray(campaign.days) ? campaign.days : [];
    for (const day of days) {
      totals.views += Number(day.views) || 0;
      totals.clicks += Number(day.clicks) || 0;
      totals.sum += Number(day.sum) || 0;
      totals.atbs += Number(day.atbs) || 0;
      totals.orders += Number(day.orders) || 0;
    }
  }
  totals.ctr = totals.views > 0 ? Number(((totals.clicks / totals.views) * 100).toFixed(2)) : 0;
  totals.cr = totals.clicks > 0 ? Number(((totals.orders / totals.clicks) * 100).toFixed(2)) : 0;

  return {
    period: { beginDate, endDate },
    balance: balanceRes,
    campaignCount: campaignIds.length,
    campaignsIncluded: limitedIds.length,
    truncated,
    totals,
    perCampaign
  };
}

function requireFeedbacksQuestionsListArgs(args) {
  if (typeof args.isAnswered !== 'boolean') throw new Error('isAnswered (boolean) is required');
  if (!Number.isInteger(args.take) || args.take < 1) throw new Error('take (positive integer) is required');
  if (!Number.isInteger(args.skip) || args.skip < 0) throw new Error('skip (non-negative integer) is required');
}

function truncateToDate(datetimeStr) {
  return datetimeStr.slice(0, 10);
}

async function fetchBusinessSummary({ dateFrom, dateTo, adsBeginDate, adsEndDate }) {
  const beginDate = adsBeginDate || truncateToDate(dateFrom);
  const endDate = adsEndDate || truncateToDate(dateTo);

  const [financeResult, adsResult, ordersResult] = await Promise.allSettled([
    (async () => {
      const { rows, truncated } = await fetchAllSalesReportDetailed({ dateFrom, dateTo, period: 'weekly' });
      const { totals, topByNmId, uniqueNmIdCount } = aggregateFinanceSummary(rows, 10);
      return { rowCount: rows.length, uniqueNmIdCount, truncated, totals, topByNmId };
    })(),
    fetchAdsSummary({ beginDate, endDate, includeStatuses: ADV_ACTIVE_STATUSES }),
    callWb(`${API_URLS.MARKETPLACE}/api/v3/orders/new`, 'GET')
  ]);

  function unwrap(settled, label) {
    if (settled.status === 'fulfilled') return settled.value;
    return { error: settled.reason?.message || String(settled.reason), source: label };
  }

  const finance = unwrap(financeResult, 'finance');
  const ads = unwrap(adsResult, 'ads');
  const orders = unwrap(ordersResult, 'orders');

  return {
    period: { dateFrom, dateTo, adsBeginDate: beginDate, adsEndDate: endDate },
    finance,
    ads,
    newOrdersCount: Array.isArray(orders?.orders) ? orders.orders.length : null,
    newOrders: orders?.error ? orders : undefined
  };
}

async function executeTool(name, args = {}) {
  switch (name) {
    case 'wb_sales_funnel': {
      requireDateRange(args);
      const body = {
        selectedPeriod: { start: args.start, end: args.end },
        nmIds: args.nmIds,
        skipDeletedNm: false
      };
      if (args.limit !== undefined) body.limit = args.limit;
      if (args.offset !== undefined) body.offset = args.offset;
      return callWb(`${API_URLS.ANALYTICS}/api/analytics/v3/sales-funnel/products`, 'POST', body);
    }

    case 'wb_sales_funnel_history': {
      requireDateRange(args);
      return callWb(`${API_URLS.ANALYTICS}/api/analytics/v3/sales-funnel/products/history`, 'POST', {
        selectedPeriod: { start: args.start, end: args.end },
        nmIds: args.nmIds,
        skipDeletedNm: false,
        aggregationLevel: args.aggregationLevel || 'day'
      });
    }

    case 'wb_search_texts': {
      requireDateRange(args);
      const body = {
        currentPeriod: { start: args.start, end: args.end },
        nmIds: args.nmIds,
        topOrderBy: args.topOrderBy || 'openCard',
        includeSubstitutedSKUs: args.includeSubstitutedSKUs !== false,
        includeSearchTexts: args.includeSearchTexts !== false,
        orderBy: args.orderBy || { field: 'openCard', mode: 'desc' },
        limit: args.limit || 30
      };
      if (body.includeSubstitutedSKUs === false && body.includeSearchTexts === false) {
        throw new Error('includeSubstitutedSKUs and includeSearchTexts cannot both be false');
      }
      return callWb(`${API_URLS.ANALYTICS}/api/v2/search-report/product/search-texts`, 'POST', body);
    }

    case 'wb_stocks':
      requireStocksBody(args.body);
      return callWb(`${API_URLS.ANALYTICS}/api/v2/stocks-report/products/products`, 'POST', args.body);

    case 'wb_ad_campaign_stats':
      requireAdParams(args.params);
      return callWb(`${API_URLS.ADVERT}/adv/v3/fullstats`, 'GET', args.params);

    case 'wb_account_balance':
      return callWb(`${API_URLS.FINANCE}/api/v1/account/balance`, 'GET');

    case 'wb_sales_report_list': {
      requireFinanceDateRange(args);
      const body = {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        period: args.period || 'weekly'
      };
      if (args.limit !== undefined) body.limit = args.limit;
      if (args.offset !== undefined) body.offset = args.offset;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/list`, 'POST', body);
    }

    case 'wb_sales_report_detailed': {
      requireFinanceDateRange(args);
      const body = {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        limit: args.limit !== undefined ? args.limit : 100000,
        rrdId: args.rrdId !== undefined ? args.rrdId : 0,
        period: args.period || 'weekly'
      };
      if (args.fields !== undefined) body.fields = args.fields;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/detailed`, 'POST', body);
    }

    case 'wb_sales_report_detailed_by_id': {
      if (args.reportId === undefined || args.reportId === null) throw new Error('reportId is required');
      const body = {
        limit: args.limit !== undefined ? args.limit : 100000,
        rrdId: args.rrdId !== undefined ? args.rrdId : 0
      };
      if (args.fields !== undefined) body.fields = args.fields;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/sales-reports/detailed/${encodeURIComponent(args.reportId)}`, 'POST', body);
    }

    case 'wb_acquiring_detailed': {
      requireFinanceDateRange(args);
      const body = {
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        limit: args.limit !== undefined ? args.limit : 100000,
        rrdId: args.rrdId !== undefined ? args.rrdId : 0
      };
      if (args.fields !== undefined) body.fields = args.fields;
      return callWb(`${API_URLS.FINANCE}/api/finance/v1/acquiring/detailed`, 'POST', body);
    }

    case 'wb_finance_summary': {
      requireFinanceDateRange(args);
      const { rows, truncated } = await fetchAllSalesReportDetailed({
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        period: args.period
      });
      const { totals, topByNmId, uniqueNmIdCount } = aggregateFinanceSummary(rows, args.topN || 20);
      return {
        period: { dateFrom: args.dateFrom, dateTo: args.dateTo, granularity: args.period || 'weekly' },
        rowCount: rows.length,
        uniqueNmIdCount,
        truncated,
        totals,
        topByNmId
      };
    }

    case 'wb_adv_campaigns_count':
      return callWb(`${API_URLS.ADVERT}/adv/v1/promotion/count`, 'GET');

    case 'wb_adv_campaigns_info': {
      const params = {};
      if (args.ids) params.ids = args.ids;
      if (args.statuses) params.statuses = args.statuses;
      if (args.paymentType) params.payment_type = args.paymentType;
      return callWb(`${API_URLS.ADVERT}/api/advert/v2/adverts`, 'GET', params);
    }

    case 'wb_adv_balance':
      return callWb(`${API_URLS.ADVERT}/adv/v1/balance`, 'GET');

    case 'wb_adv_budget':
      if (args.id === undefined || args.id === null) throw new Error('id is required');
      return callWb(`${API_URLS.ADVERT}/adv/v1/budget`, 'GET', { id: args.id });

    case 'wb_adv_bids_recommendations':
      if (args.nmId === undefined || args.advertId === undefined) throw new Error('nmId and advertId are required');
      return callWb(`${API_URLS.ADVERT}/api/advert/v0/bids/recommendations`, 'GET', { nmId: args.nmId, advertId: args.advertId });

    case 'wb_ads_summary': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.beginDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) {
        throw new Error('beginDate and endDate must use YYYY-MM-DD format');
      }
      return fetchAdsSummary({
        beginDate: args.beginDate,
        endDate: args.endDate,
        includeStatuses: args.includeStatuses
      });
    }

    case 'wb_feedbacks_questions_unread':
      return callWb(`${API_URLS.FEEDBACKS}/api/v1/new-feedbacks-questions`, 'GET');

    case 'wb_feedbacks_list':
      requireFeedbacksQuestionsListArgs(args);
      return callWb(`${API_URLS.FEEDBACKS}/api/v1/feedbacks`, 'GET', args);

    case 'wb_feedback_answer': {
      if (!args.id || !args.text) throw new Error('id and text are required');
      const method = args.edit ? 'PATCH' : 'POST';
      await callWb(`${API_URLS.FEEDBACKS}/api/v1/feedbacks/answer`, method, { id: args.id, text: args.text });
      return { ok: true };
    }

    case 'wb_questions_list':
      requireFeedbacksQuestionsListArgs(args);
      return callWb(`${API_URLS.FEEDBACKS}/api/v1/questions`, 'GET', args);

    case 'wb_question_view':
      if (!args.id) throw new Error('id is required');
      return callWb(`${API_URLS.FEEDBACKS}/api/v1/questions`, 'PATCH', { id: args.id, wasViewed: true });

    case 'wb_question_answer':
      if (!args.id || !args.text) throw new Error('id and text are required');
      return callWb(`${API_URLS.FEEDBACKS}/api/v1/questions`, 'PATCH', { id: args.id, answer: { text: args.text } });

    case 'wb_chats_list':
      return callWb(`${API_URLS.CHAT}/api/v1/seller/chats`, 'GET');

    case 'wb_chat_events': {
      const params = {};
      if (args.next !== undefined) params.next = args.next;
      return callWb(`${API_URLS.CHAT}/api/v1/seller/events`, 'GET', params);
    }

    case 'wb_chat_send_message':
      if (!args.replySign || !args.message) throw new Error('replySign and message are required');
      return callWbMultipart(`${API_URLS.CHAT}/api/v1/seller/message`, {
        replySign: args.replySign,
        message: args.message
      });

    case 'wb_tariffs_commission': {
      const params = {};
      if (args.locale) params.locale = args.locale;
      return callWb(`${API_URLS.COMMON}/api/v1/tariffs/commission`, 'GET', params);
    }

    case 'wb_tariffs_box':
      if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('date (YYYY-MM-DD) is required');
      return callWb(`${API_URLS.COMMON}/api/v1/tariffs/box`, 'GET', { date: args.date });

    case 'wb_orders_new':
      return callWb(`${API_URLS.MARKETPLACE}/api/v3/orders/new`, 'GET');

    case 'wb_orders_status':
      if (!Array.isArray(args.orders) || args.orders.length === 0 || args.orders.length > 1000) {
        throw new Error('orders must be an array of 1 to 1000 order IDs');
      }
      return callWb(`${API_URLS.MARKETPLACE}/api/v3/orders/status`, 'POST', { orders: args.orders });

    case 'wb_order_cancel':
      if (args.orderId === undefined || args.orderId === null) throw new Error('orderId is required');
      await callWb(`${API_URLS.MARKETPLACE}/api/v3/orders/${encodeURIComponent(args.orderId)}/cancel`, 'PATCH');
      return { ok: true, orderId: args.orderId, status: 'cancel' };

    case 'wb_business_summary':
      requireFinanceDateRange(args);
      return fetchBusinessSummary({
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        adsBeginDate: args.adsBeginDate,
        adsEndDate: args.adsEndDate
      });

    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function makeToolResult(data, isError = false) {
  return {
    resultType: 'complete',
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
    ...(isError ? { isError: true } : {})
  };
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mcp', protocol: MCP_PROTOCOL_VERSION }));

app.post('/mcp', auth, async (req, res) => {
  const message = req.body;
  const id = message && message.id;
  const method = message && message.method;
  const params = message && message.params ? message.params : {};
  const protocol = req.headers['mcp-protocol-version'] || params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  const modern = protocol === MCP_PROTOCOL_VERSION || method === 'server/discover';

  if (!message || message.jsonrpc !== '2.0' || !method) {
    return res.status(400).json(jsonRpcError(id ?? null, -32600, 'Invalid Request'));
  }

  try {
    if (method === 'server/discover') {
      return res.json(jsonRpcResult(id, {
        supportedProtocolVersions: [MCP_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'wildberries-api-mcp-server', version: '2.0.0' },
        instructions: 'Wildberries read-only analytics and advertising tools. WB credentials stay on the server.'
      }));
    }

    if (method === 'initialize') {
      const requested = params.protocolVersion || LEGACY_PROTOCOL_VERSION;
      const negotiated = [MCP_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION].includes(requested) ? requested : LEGACY_PROTOCOL_VERSION;
      return res.json(jsonRpcResult(id, {
        protocolVersion: negotiated,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'wildberries-api-mcp-server', version: '2.0.0' },
        instructions: 'Wildberries read-only analytics and advertising tools.'
      }));
    }

    if (method === 'notifications/initialized') return res.status(202).end();
    if (method === 'ping') return res.json(jsonRpcResult(id, {}));

    if (method === 'tools/list') {
      return res.json(jsonRpcResult(id, modern ? {
        resultType: 'complete',
        tools,
        ttlMs: 300000,
        cacheScope: 'public'
      } : { tools }));
    }

    if (method === 'tools/call') {
      if (!params.name) return res.status(400).json(jsonRpcError(id, -32602, 'Tool name is required'));
      if (!tools.some(tool => tool.name === params.name)) return res.status(400).json(jsonRpcError(id, -32602, `Unknown tool: ${params.name}`));
      try {
        const data = await executeTool(params.name, params.arguments || {});
        return res.json(jsonRpcResult(id, makeToolResult(data)));
      } catch (error) {
        const details = {
          message: error.message,
          status: error.statusCode,
          retryAfter: error.retryAfter || null,
          details: error.details || null
        };
        return res.json(jsonRpcResult(id, makeToolResult(details, true)));
      }
    }

    return res.status(400).json(jsonRpcError(id, -32601, `Method not found: ${method}`));
  } catch (error) {
    return res.status(500).json(jsonRpcError(id ?? null, -32603, error.message || 'Internal error'));
  }
});

app.all('/mcp', (req, res) => res.status(405).json({ error: 'Method Not Allowed' }));

module.exports = { app, PORT, executeTool, tools };

if (require.main === module) {
  app.listen(PORT, () => console.log(`Wildberries MCP server running on port ${PORT}`));
}
