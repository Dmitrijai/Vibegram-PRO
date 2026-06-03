// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { JWT } from "https://esm.sh/google-auth-library@9";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Обработка CORS preflight (OPTIONS запрос)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var');
    }

    const authHeader = req.headers.get('Authorization');
    
    // Create an admin client to bypass RLS when fetching chats/profiles
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    
    // Авторизация для FCM v1 API
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const tokens = await jwtClient.getAccessToken();
    const accessToken = tokens.token;

    // Читаем тело из вызова с клиента
    const payload = await req.json();
    
    // Делаем обработку гибкой
    let reqData = payload;
    if (payload && !payload.token && !payload.tokens && payload.body) {
         if (typeof payload.body === 'string') {
             try { reqData = JSON.parse(payload.body); } catch(e) {}
         } else {
             reqData = payload.body;
         }
    }
    
    // ----------------------------------------------------
    // УЛУЧШЕННАЯ СЕРВЕРНАЯ ЛОГИКА ФОРМАТИРОВАНИЯ (СЕРВЕРНЫЙ АВТОРИТЕТ)
    // ----------------------------------------------------
    let chatId = reqData.chat_id || (reqData.data && (reqData.data.chatId || reqData.data.chat_id));
    let rawText = reqData.text || reqData.body || "";
    let cleanText = "";

    // 1. Извлекаем чистый текст сообщения
    if (rawText) {
       if (rawText.startsWith("Vibegram:")) {
           cleanText = rawText.substring("Vibegram:".length).trim();
       } else if (rawText.includes(":")) {
           const parts = rawText.split(":");
           const possiblePrefix = parts[0].trim();
           if (possiblePrefix === "Vibegram" || possiblePrefix === "Пользователь") {
               parts.shift();
               cleanText = parts.join(":").trim();
           } else {
               cleanText = rawText;
           }
       } else {
           cleanText = rawText;
       }
    }
    if (!cleanText || cleanText.trim() === "") {
        cleanText = "Новое сообщение";
    }

    // 2. Идентифицируем реальное имя отправителя (через JWT пользователя)
    let resolvedSenderName = reqData.sender_name || "Пользователь";
    let userId = null;
    
    if (authHeader) {
        try {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
            if (authError) console.error("Auth error:", authError);
            
            if (user) {
                userId = user.id;
                console.log("Logged in user resolved:", userId);
                const { data: profile, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .select('display_name, username')
                    .eq('id', userId)
                    .single();
                if (profileError) console.error("Profile fetch error:", profileError);
                
                if (profile) {
                    resolvedSenderName = profile.display_name || profile.username || resolvedSenderName;
                } else if (user.user_metadata?.full_name) {
                    resolvedSenderName = user.user_metadata.full_name;
                } else if (user.user_metadata?.display_name) {
                    resolvedSenderName = user.user_metadata.display_name;
                }
            }
        } catch (e) {
            console.error("JWT user retrieval / profile querying error:", e);
        }
    }
    
    if (!resolvedSenderName || resolvedSenderName === "Vibegram" || resolvedSenderName === "Пользователь") {
        resolvedSenderName = "Пользователь";
    }

    // 3. Вычисляем заголовок (title) и текст (bodyText) уведомления на основе типа чата
    let title = reqData.title || "Vibegram";
    let bodyText = cleanText;

    if (!chatId && userId) {
        try {
            const { data: lastMsg } = await supabaseAdmin
                .from('messages')
                .select('chat_id, content')
                .eq('sender_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (lastMsg) {
                chatId = lastMsg.chat_id;
                if (!reqData.text && lastMsg.content) {
                    cleanText = lastMsg.content;
                }
            }
        } catch(e) {
            console.warn("Could not fetch last message chat fallback:", e);
        }
    }

    if (chatId) {
        try {
            const { data: chatData, error: chatError } = await supabaseAdmin
                .from('chats')
                .select('type, title')
                .eq('id', chatId)
                .single();
                
            if (chatError) console.error("Chat fetch error inside send-push:", chatError);
            
            if (chatData) {
                if (chatData.type === 'channel') {
                    title = chatData.title || "Канал";
                    bodyText = cleanText;
                } else if (chatData.type === 'group') {
                    title = chatData.title || "Группа";
                    bodyText = `${resolvedSenderName}: ${cleanText}`;
                } else {
                    title = resolvedSenderName;
                    bodyText = cleanText;
                }
            } else {
                title = resolvedSenderName;
                bodyText = cleanText;
            }
        } catch (e) {
            console.error("Database query error in send-push parsing:", e);
            title = resolvedSenderName;
            bodyText = cleanText;
        }
    } else {
        if (title === "Vibegram") title = resolvedSenderName;
        bodyText = cleanText;
    }

    console.log("Processed Push notification payload server-side:", { title, bodyText });
    
    // Подготовим URL на который нужно перенаправить при клике.
    const requestOrigin = req.headers.get('origin') || Deno.env.get('FRONTEND_URL') || "https://vibegram.web.app";
    let targetLink = requestOrigin + "/";
    if (chatId) {
        targetLink = `${requestOrigin}/?chatId=${chatId}`;
    }

    // FCM v1 строго требует, чтобы ВСЕ значения внутри объекта "data" были строками
    const pushData: Record<string, string> = {
        title: title,
        body: bodyText,
        chatId: String(chatId || "")
    };
    if (reqData.data && typeof reqData.data === 'object') {
      for (const [key, value] of Object.entries(reqData.data)) {
        pushData[key] = String(value);
      }
    }

    const targetTokens = reqData.tokens || (reqData.token ? [reqData.token] : []);

    if (targetTokens.length === 0) {
      return new Response(JSON.stringify({ error: "No tokens provided" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400
      });
    }

    const projectId = serviceAccount.project_id;
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const sendResults = await Promise.all(targetTokens.map(async (token: string) => {
      const fcmMessage: any = {
        message: {
          token: token,
          // Основной notification блок необходим для iOS APNs и системного wake.
          notification: {
            title: title,
            body: bodyText
          },
          android: {
            priority: "high",
            notification: {
               // Для Android лучше использовать default или абсолютный путь. 
               // Но чтобы не было сбоев с иконками, проще оставить пустым (будет использована иконка из PWA)
            }
          },
          webpush: {
            headers: {
              Urgency: "high"
            },
            notification: {
              icon: `${requestOrigin}/apple-touch-icon.png`, 
              badge: `${requestOrigin}/apple-touch-icon.png`, 
            }
          },
          data: pushData
        }
      };

      const response = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmMessage)
      });
      return await response.json();
    }));

    return new Response(JSON.stringify({ success: true, results: sendResults }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500
    });
  }
});
