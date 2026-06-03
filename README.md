# QQ Mail Head

获取 QQ 邮箱头像的 Cloudflare Worker 代理服务。

## 功能

通过 Cookie Cloud 获取 QQ 邮箱 cookie，调用邮箱 API 获取用户头像，支持 Cloudflare Cache 缓存。

## API

```
GET /api/v1/qqmail_head/{email}
```

返回头像图片，邮箱无效时返回 400 错误。

## 环境变量

| 变量 | 说明 |
|------|------|
| `COOKIE_SERVER_HOST` | Cookie Server 地址 |
| `COOKIE_SERVER_ACCOUNT_UUID` | 账户 UUID |
| `COOKIE_SERVER_ACCOUNT_PASSWORD` | 账户密码 |
| `COOKIE_SERVER_CRYPTO_TYPE` | 加密算法，可选 `aes-128-cbc-fixed` 或 `legacy`（默认） |

## 部署

```bash
npm install
npx wrangler secret put COOKIE_SERVER_HOST
npx wrangler secret put COOKIE_SERVER_ACCOUNT_UUID
npx wrangler secret put COOKIE_SERVER_ACCOUNT_PASSWORD
npm run deploy
```

## 开发

```bash
npm run dev
# 将环境变量写入.dev.vars
```
