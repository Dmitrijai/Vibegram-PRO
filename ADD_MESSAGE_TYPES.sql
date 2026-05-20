ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check CHECK (message_type in ('text', 'voice', 'video_circle', 'poll', 'photo', 'video', 'document', 'audio', 'gift'));
