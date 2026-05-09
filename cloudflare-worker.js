export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const proxyHost = url.hostname;
    
    // Адрес вашего оригинального Supabase
    const SUPABASE_HOST = "dxoyyflsqrzgzjfihgcx.supabase.co";
    url.hostname = SUPABASE_HOST;

    const newRequest = new Request(url.toString(), new Request(request, {
      redirect: "manual"
    }));

    // Обязательные заголовки для правильной работы OAuth и API
    newRequest.headers.set("Host", SUPABASE_HOST);
    newRequest.headers.set("X-Forwarded-Host", proxyHost);
    newRequest.headers.set("X-Forwarded-Proto", "https");

    // Если это OPTIONS (CORS Preflight), сразу отдаем 200 OK
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    // Если это WebSocket (realtime), мы ДОЛЖНЫ вернуть ответ напрямую,
    // иначе WebSocket разорвется.
    if (request.headers.get("Upgrade") === "websocket") {
      return await fetch(newRequest);
    }

    // Делаем запрос к Supabase
    const response = await fetch(newRequest);

    // Если это HTTP-редирект (например, после Google OAuth),
    // подменяем адрес Supabase обратно на наш домен
    if ([301, 302, 303, 307, 308].includes(response.status)) {
       const location = response.headers.get("Location");
       if (location) {
           const newLocation = location.replaceAll(SUPABASE_HOST, proxyHost);
           const newResponse = new Response(response.body, response);
           newResponse.headers.set("Location", newLocation);
           // Всегда добавляем CORS даже к редиректам
           newResponse.headers.set("Access-Control-Allow-Origin", "*");
           return newResponse;
       }
    }
    
    // Для обычных запросов (REST API) добавляем CORS
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    newResponse.headers.set("Access-Control-Allow-Headers", "*");
    
    return newResponse;
  }
}
