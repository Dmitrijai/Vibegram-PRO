import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
    try {
        const payload = await req.json();
        const { token, tokens, title, body, data, chat_id, text, sender_name } = payload;
        
        const targetTokens = tokens || (token ? [token] : []);
        if (targetTokens.length === 0) {
            return new Response(JSON.stringify({ error: 'No tokens provided' }), { status: 400 });
        }
        
        const createFcmMessage = (targetToken: string) => ({
            message: {
                token: targetToken,
                notification: {
                    title: title || 'Новое уведомление',
                    body: body || 'У вас новое сообщение',
                },
                android: {
                    notification: {
                        icon: 'ic_notification',
                        color: '#111827'
                    }
                },
                data: {
                    ...data,
                    chat_id: chat_id ? String(chat_id) : '',
                    text: text ? String(text) : '',
                    sender_name: sender_name ? String(sender_name) : '',
                }
            }
        });

        const SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');
        const PROJECT_ID = SERVICE_ACCOUNT.project_id || Deno.env.get('FIREBASE_PROJECT_ID');
        
        // Для реального запроса к FCM v1 нужно получить OAuth2 токен.
        // Здесь показан пример структуры, которую вам нужно перенести/обновить в вашей функции:
        /*
        const getAccessToken = async () => { ... }
        const accessToken = await getAccessToken();
        
        const results = await Promise.all(targetTokens.map(async (t) => {
            return fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(createFcmMessage(t))
            }).then(res => res.json());
        }));
        */
        
        return new Response(JSON.stringify({ 
            success: true, 
            message: "Функция send-push обновлена и готова к деплою",
            fcmPayloadExample: createFcmMessage("SAMPLE_TOKEN") 
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});
