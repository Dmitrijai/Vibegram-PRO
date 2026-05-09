export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // Адрес оригинального Supabase
        const SUPABASE_HOST = "dxoyyflsqrzgzjfihgcx.supabase.co";
        
        // Переписываем хост на Supabase
        url.hostname = SUPABASE_HOST;

        // Создаем новый запрос с измененным URL, сохраняя метод, тело и заголовки
        const newRequest = new Request(url.toString(), request);
        
        // Добавляем заголовки, если нужно (обычно Supabase сам разбирается, но для OAuth полезно)
        newRequest.headers.set("X-Forwarded-Host", request.headers.get("Host"));
        
        // Если это OPTIONS (CORS Preflight), обрабатываем сами
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    ...corsHeaders,
                    "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*"
                }
            });
        }

        // Проксируем запрос в Supabase (включая WebSockets - Cloudflare делает это автоматически)
        try {
            const response = await fetch(newRequest);
            
            // Клонируем ответ, чтобы добавить свои CORS заголовки
            const newResponse = new Response(response.body, response);
            
            for (const [key, value] of Object.entries(corsHeaders)) {
                newResponse.headers.set(key, value);
            }

            return newResponse;
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }
};

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,PUT,PATCH,DELETE",
    "Access-Control-Expose-Headers": "*"
};
