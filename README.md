# Payments Service

Единый сервис инвойсов для всех проектов: создаёт платёж в **YooKassa** (RUB) или **WeChat Pay Native** (CNY), отдаёт ссылку на оплату, а после оплаты шлёт подписанное уведомление на `callbackUrl` проекта.

## API

Все запросы — с заголовком `X-API-Key: <ключ проекта>` (ключи задаются в `API_KEYS=project:key,...`). Проект видит только свои инвойсы. Swagger — `/docs`.

### Создать инвойс — `POST /api/v1/invoices`

```json
{
  "orderId": "order-42",
  "provider": "yookassa",
  "amount": 199.9,
  "description": "Подписка на месяц",
  "callbackUrl": "https://my-shop.example.com/payments/callback",
  "returnUrl": "https://my-shop.example.com/thanks",
  "metadata": { "orderId": "42" }
}
```

| поле          | обяз. | описание                                                                        |
| ------------- | ----- | ------------------------------------------------------------------------------- |
| `orderId`     | нет   | ID заказа в вашем проекте — ключ идемпотентности (до 128 символов)              |
| `provider`    | да    | `yookassa` (RUB) / `wechat` (CNY)                                               |
| `amount`      | да    | сумма в рублях/юанях, до 2 знаков                                               |
| `callbackUrl` | да    | куда прислать уведомление об оплате/отмене                                      |
| `description` | нет   | назначение платежа, до 127 символов                                             |
| `returnUrl`   | нет   | только yookassa: куда вернуть пользователя (по умолчанию `YOOKASSA_RETURN_URL`) |
| `metadata`    | нет   | любые данные проекта (до 4 КБ), возвращаются в ответах и уведомлениях           |

Ответ `201`:

```json
{
  "id": "6f1c…",
  "orderId": "order-42",
  "provider": "yookassa",
  "status": "pending",
  "amount": 199.9,
  "currency": "RUB",
  "description": "Подписка на месяц",
  "paymentUrl": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=…",
  "metadata": { "orderId": "42" },
  "createdAt": "2026-11-06T12:00:00.000Z",
  "paidAt": null,
  "canceledAt": null
}
```

**Идемпотентность.** Если передан `orderId`, повторный запрос с тем же `orderId` не создаёт новый платёж:

- те же `provider` и `amount` → `200` и ранее созданный инвойс (в любом статусе);
- другие `provider` / `amount` → `409`;
- параллельный запрос, пока первый ещё создаёт платёж у провайдера → `409`, повторите через секунду.

`orderId` уникален в рамках проекта. Если оплата отменена и нужен новый платёж — используйте новый `orderId` (например `order-42-2`). Если провайдер вернул ошибку при создании, `orderId` освобождается и запрос можно повторить.

Для `wechat` `paymentUrl` — это `weixin://wxpay/bizpayurl?pr=…`: его нужно показать пользователю как QR-код.

### Статус инвойса — `GET /api/v1/invoices/:id`

Возвращает тот же объект. `status`: `pending` → `paid` | `canceled`.

### Уведомление на `callbackUrl`

`POST` с телом:

```json
{ "event": "invoice.paid", "invoice": { "id": "6f1c…", "status": "paid", "...": "..." } }
```

`event`: `invoice.paid` или `invoice.canceled` (отмена приходит только от YooKassa).

Заголовки для проверки подлинности:

- `X-Payments-Timestamp` — unix-время (сек)
- `X-Payments-Signature` — `hex(HMAC-SHA256(apiKey, timestamp + "." + rawBody))`

```ts
const expected = createHmac('sha256', API_KEY).update(`${ts}.${rawBody}`).digest('hex');
const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
```

Нужно ответить `2xx`. Иначе — повторы с нарастающей задержкой (30с, 1м, 5м, 15м … 24ч), всего `CALLBACK_MAX_ATTEMPTS` попыток. Обработчик должен быть идемпотентным (по `invoice.id`) — при сетевых сбоях одно событие может прийти повторно.

### Вебхуки провайдеров

| провайдер | URL                                      | где настроить                                                              |
| --------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| YooKassa  | `https://<host>/api/v1/yookassa/webhook` | личный кабинет → HTTP-уведомления: `payment.succeeded`, `payment.canceled` |
| WeChat    | `https://<host>/api/v1/wechat/callback`  | `WECHAT_NOTIFY_URL` (передаётся в каждом заказе)                           |

YooKassa: телу вебхука не доверяем — статус перепроверяется запросом `GET /v3/payments/{id}`. WeChat: ресурс расшифровывается ключом APIv3 (AES-GCM), что подтверждает отправителя. Сертификаты WeChat (`apiclient_cert.pem`, `apiclient_key.pem`) кладутся в `WECHAT_CERTS_DIR` (по умолчанию `data/keys`, в docker-compose монтируется `./data/keys`). Провайдер без настроек просто отключён — запрос на него вернёт `400`.

### БД и миграции

PostgreSQL + TypeORM, миграции применяются автоматически при старте.

```bash
docker compose up -d postgres                                        # локальная БД
npm run migration:generate -- src/modules/database/migrations/<Name> # после изменения entity
npm run migration:run
```

e2e-тесты (`npm run test:e2e`) сами поднимают временный Postgres через [testcontainers](https://testcontainers.com) (`test/global-setup.ts`) и удаляют его после прогона — нужен только запущенный Docker. Так же они работают в CI.

---

Сервис создан из шаблона NestJS-сервисов.

## Стек

- **NestJS 12** + **TypeScript 6** (strict)
- **ESLint 10** (flat config, type-checked) + **Prettier**
- **Husky** + **lint-staged** + **commitlint** (Conventional Commits)
- **@nestjs/config** + **zod** — валидация env при старте
- **nestjs-pino** — структурные JSON-логи (pretty в dev)
- **@nestjs/terminus** — `/health/live`, `/health/ready`
- **Swagger** — `/docs` (включается `SWAGGER_ENABLED=true`)
- **helmet**, CORS, глобальный `ValidationPipe`, URI-версионирование (`/api/v1/...`)
- Глобальный exception filter с единым форматом ошибок
- **Jest** (unit + e2e), Docker (multi-stage, non-root, healthcheck), GitHub Actions CI, Dependabot

## Требования

Node.js **24.9+** (см. `.nvmrc`). Nest 12 поставляется как ESM, а Jest грузит его через нативный `require(esm)`, который есть только в Node 24.9+.

## Быстрый старт

```bash
nvm use
npm install
cp .env.example .env
npm run start:dev
```

## Скрипты

| Скрипт                               | Описание                       |
| ------------------------------------ | ------------------------------ |
| `npm run start:dev`                  | запуск в watch-режиме          |
| `npm run build`                      | сборка в `dist/`               |
| `npm run start:prod`                 | запуск сборки                  |
| `npm run lint` / `lint:check`        | ESLint с автофиксом / проверка |
| `npm run format` / `format:check`    | Prettier                       |
| `npm run typecheck`                  | `tsc --noEmit`                 |
| `npm test` / `test:e2e` / `test:cov` | тесты                          |

## Git-хуки

- `pre-commit` → `lint-staged` (eslint + prettier на изменённых файлах, typecheck при изменении `.ts`)
- `commit-msg` → `commitlint` (`feat: ...`, `fix(scope): ...`, `chore: ...`)

## Структура

```
src/
├── common/             # фильтры, guards (ApiKeyGuard)
├── config/             # схема env (zod) и типизированный AppConfigService
├── modules/
│   ├── health/         # health-check (+ ping БД)
│   ├── database/       # TypeORM, entity, миграции
│   ├── invoices/       # публичный API инвойсов
│   ├── yookassa/       # клиент YooKassa + вебхук
│   ├── wechat/         # клиент WeChat Pay + вебхук
│   └── callbacks/      # уведомления проектам, ретраи
├── app.module.ts
├── setup-app.ts        # общая настройка приложения (main + e2e)
└── main.ts
test/                   # e2e-тесты
```

## Использование как шаблона

> Не используйте кнопку **Use this template** на GitHub. Она создаёт репозиторий без общей истории с шаблоном, и подтягивать обновления потом придётся через `--allow-unrelated-histories` с конфликтами почти во всех файлах. Клонируйте шаблон с историей, тогда обновления вливаются обычным `git merge`.

### Старт нового проекта

```bash
# 1. Создайте пустой репозиторий на GitHub (без README/.gitignore), например HUAYUN-vision/my-service

# 2. Клон шаблона с историей
git clone https://github.com/HUAYUN-vision/nestjs-template.git my-service
cd my-service

# 3. Шаблон становится remote "template", а origin указывает на новый репозиторий
git remote rename origin template
git remote add origin https://github.com/HUAYUN-vision/my-service.git

# 4. ВАЖНО: не тянуть теги шаблона
git config remote.template.tagOpt --no-tags
git tag -l | xargs git tag -d

# 5. Настройка под проект (см. ниже), затем
git commit -am "chore: init my-service from nestjs-template"
git push -u origin main
```

**Почему без тегов.** Версия считается от последнего тега `vX.Y.Z` (`git describe --tags`). Если теги шаблона попадут в проект, он «унаследует» чужую версию, а релиз может упасть на уже существующем теге.

Что поменять в новом проекте:

1. `package.json`: `name`, `description`, `"version": "0.0.0"`.
2. `README.md`, `docker-compose.yml` (имена сервисов и образов), `.env.example`.
3. Новые переменные окружения добавляйте в `src/config/env.validation.ts` и `.env.example`.
4. Проверки БД / Redis / внешних сервисов добавляйте в `HealthController.ready()`.

### Как подтягивать изменения из шаблона

```bash
git fetch template
git checkout -b chore/sync-template
git merge template/main
# разрешить конфликты, затем:
npm install          # пересобрать lock, если конфликтовал package-lock.json
npm run build && npm test
git push -u origin chore/sync-template   # и открыть PR
```

Заголовок PR: `chore: sync with nestjs-template`, тогда релиз не выпускается. Если в шаблоне был важный фикс, ставьте `fix: ...`, тогда выйдет patch-релиз.

Типичные конфликты:

- **`package.json` → `version`, `name`**: всегда оставляйте значения проекта. Шаблон сам делает коммиты `chore(release): vX.Y.Z`, поэтому версия конфликтует при каждом мердже.
- **`package-lock.json`**: не правьте руками. Возьмите любую сторону и выполните `npm install`.
- **Зависимости**: dependabot обновляет их и в шаблоне, и в проекте. Берите более новую версию.

### Как уменьшить число конфликтов

- Держите общее в шаблоне, а специфичное для проекта в отдельных файлах и модулях. Чем реже проект меняет «шаблонные» файлы (`eslint.config.mjs`, `tsconfig*`, `Dockerfile`, `.github/`, `src/main.ts`, `src/setup-app.ts`), тем проще мердж.
- CI вынесен в [`HUAYUN-vision/ci-cd-workflows`](https://github.com/HUAYUN-vision/ci-cd-workflows) (`@v1`), так что улучшения пайплайна доходят до проектов без мерджа. Конфиг Dependabot синхронизирует workflow `dependabot-sync.yml`: раз в неделю он открывает PR.
- Синхронизируйтесь регулярно: несколько мелких мерджей проще одного большого раз в полгода.
