# bazi-anima 后端

一个函数：`POST /api/ask` → `{question, chart}` 进，`{script}` 出（DSL 动画脚本）。

## 部署（Vercel，推荐先用这个）

```bash
cd server
npm i -g vercel
vercel login
vercel env add BAZI_API_KEY     # 粘你的中转 key
vercel deploy --prod            # 得到 https://xxx.vercel.app
```

前端接上：在 prototype.html 打开前设
`window.BAZI_API = 'https://xxx.vercel.app/api/ask'`
（或在页面 URL 后加 `#api=https://xxx.vercel.app/api/ask`）

## 或 Cloudflare Worker（国内可达性通常更好）

```bash
cd server
npx wrangler login
npx wrangler secret put BAZI_API_KEY
npx wrangler deploy worker.js --name bazi-ask
```

## 本地冒烟

```bash
cp .env.example .env   # 填 key
node test-local.js "钱的方面呢"
```

## 安全

- key 只存环境变量。`.env` 已 gitignore。**绝不进前端、绝不进仓库。**
- 你在聊天里贴过一次这个 key —— 建议在中转平台上轮换掉，换新 key 只配到环境变量里。
- Worker/Vercel 层做了输入长度限制（question ≤200 字）和脚本白名单校验，
  上游返回不合法时报 422，前端自动回退预置动画。
