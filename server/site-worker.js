/* 前端静态站 worker —— 把 out/prototype.html 原样端出去。
 * 部署：npx wrangler deploy --config wrangler-site.toml
 * HTML 以 asset 方式随 worker 上传（rules 里声明为 Text 模块导入）。
 */
import html from '../out/prototype.html';

export default {
  async fetch() {
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  },
};
