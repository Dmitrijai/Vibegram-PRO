import { supabase, state } from "./supabase";

let callChannel: any = null;
let currentRingtone: HTMLAudioElement | null = null;
let currentCallPeerId: string | null = null;
let currentRoomName: string | null = null;
let jitsiApi: any = null;
let vibrateInterval: any = null;

const tabSessionId = Math.random().toString(36).substring(2, 10);

function playRingtone() {
  stopRingtone();
  if (navigator.vibrate) {
    try {
      navigator.vibrate([500, 500]);
    } catch (e) {}
    vibrateInterval = setInterval(() => {
      if (navigator.vibrate) {
        try {
          navigator.vibrate([500, 500]);
        } catch (e) {}
      }
    }, 1000);
  }
  const basePath = (import.meta as any).env.BASE_URL || "/";
  currentRingtone = new Audio(basePath + "sound/skype_call.mp3");
  currentRingtone.loop = true;
  currentRingtone.play().catch((e) => {
    console.error("Audio play failed:", e);
    if ((window as any).customToast) {
      (window as any).customToast(
        "Входящий звонок! (Звук заблокирован браузером)",
      );
    }
  });
}

function stopRingtone() {
  if (vibrateInterval) {
    clearInterval(vibrateInterval);
    vibrateInterval = null;
  }
  if (navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch (e) {}
  }
  if (currentRingtone) {
    currentRingtone.pause();
    currentRingtone.currentTime = 0;
    currentRingtone = null;
  }
}

function mountJitsi(roomName: string, isVideo: boolean) {
  const container = document.getElementById("jitsi-container");
  if (!container) return;
  container.innerHTML = "";
  document.getElementById("video-call-modal")!.classList.remove("hidden");

  jitsiApi = new (window as any).JitsiMeetExternalAPI("meet.jit.si", {
    roomName,
    parentNode: container,
    configOverwrite: {
      startWithVideoMuted: !isVideo,
      startWithAudioMuted: false,
      prejoinPageEnabled: false,
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
    },
    userInfo: {
      displayName: state.currentProfile?.display_name || state.currentProfile?.username,
    },
  });

  jitsiApi.addEventListeners({
    videoConferenceLeft: () => {
      endVideoCall(true);
    },
  });
}

export async function initWebRTC() {
  if (callChannel) return;
  callChannel = supabase.channel("video-calls");

  callChannel.on("broadcast", { event: "call-offer" }, async (payload: any) => {
    const data = payload.payload;
    if (data.senderTabId === tabSessionId) return;
    if (data.targetUserId === state.currentUser.id) {
      playRingtone();
      const modal = document.getElementById("incoming-call-modal")!;
      if (document.getElementById("incoming-call-name")) {
        document.getElementById("incoming-call-name")!.innerText =
          data.callerName;
      }
      if (document.getElementById("incoming-call-avatar")) {
        const incAvatar = document.getElementById("incoming-call-avatar")!;
        if (data.callerAvatar) {
          incAvatar.innerHTML = `<img src="${data.callerAvatar}" class="w-full h-full object-cover rounded-full border border-gray-700">`;
        } else {
          incAvatar.innerText = data.callerName[0].toUpperCase();
        }
      }
      modal.classList.remove("hidden");

      const acceptBtn = document.getElementById("accept-call-btn")!;
      const rejectBtn = document.getElementById("reject-call-btn")!;

      const handleAccept = async () => {
        stopRingtone();
        modal.classList.add("hidden");
        cleanup();
        await answerCall(
          data.callerId,
          data.roomName,
          data.isVideo !== false,
        );
      };

      const handleReject = () => {
        stopRingtone();
        modal.classList.add("hidden");
        cleanup();
        callChannel.send({
          type: "broadcast",
          event: "call-rejected",
          payload: { targetUserId: data.callerId, senderTabId: tabSessionId },
        });
      };

      const cleanup = () => {
        acceptBtn.removeEventListener("click", handleAccept);
        rejectBtn.removeEventListener("click", handleReject);
      };

      acceptBtn.addEventListener("click", handleAccept);
      rejectBtn.addEventListener("click", handleReject);
    }
  });

  callChannel.on(
    "broadcast",
    { event: "call-answer" },
    async (payload: any) => {
      const data = payload.payload;
      if (data.senderTabId === tabSessionId) return;
      if (data.targetUserId === state.currentUser.id) {
        stopRingtone();
        // The caller already has Jitsi mounted to the same room
        console.log("Call answered by remote peer!");
      }
    },
  );

  callChannel.on("broadcast", { event: "call-ended" }, (payload: any) => {
    const data = payload.payload;
    if (data.senderTabId === tabSessionId) return;
    if (
      data.targetUserId === state.currentUser.id ||
      data.callerId === state.currentUser.id
    ) {
      document.getElementById("incoming-call-modal")?.classList.add("hidden");
      endVideoCall(false);
    }
  });

  callChannel.on("broadcast", { event: "call-rejected" }, (payload: any) => {
    const data = payload.payload;
    if (data.senderTabId === tabSessionId) return;
    if (data.targetUserId === state.currentUser.id) {
      stopRingtone();
      endVideoCall(false);
    }
  });

  callChannel.subscribe();
}

export async function startAudioCall() {
  if (state.currentProfile?.settings?.is_tech_support)
    return alert("Технической поддержке недоступны звонки.");
  if (state.isTechSupportChat)
    return alert("Технической поддержке нельзя звонить.");
  if (!state.activeChatOtherUser)
    return alert("Аудиозвонки доступны только в личных чатах");
  await startCall(false);
}

export async function startVideoCall() {
  if (state.currentProfile?.settings?.is_tech_support)
    return alert("Технической поддержке недоступны звонки.");
  if (state.isTechSupportChat)
    return alert("Технической поддержке нельзя звонить.");
  if (!state.activeChatOtherUser)
    return alert("Видеозвонки доступны только в личных чатах");
  await startCall(true);
}

async function startCall(isVideo: boolean) {
  if (state.isAdminStatus) return alert("Звонки недоступны в режиме инкогнито");
  await initWebRTC();

  const targetUser = state.activeChatOtherUser;
  currentCallPeerId = targetUser.id;
  currentRoomName = 'VibeChat_' + Math.random().toString(36).substring(2, 15);

  mountJitsi(currentRoomName, isVideo);

  callChannel.send({
    type: "broadcast",
    event: "call-offer",
    payload: {
      targetUserId: state.activeChatOtherUser.id,
      callerId: state.currentUser.id,
      callerName:
        state.currentProfile.display_name || state.currentProfile.username,
      callerAvatar: state.currentProfile.avatar_url,
      roomName: currentRoomName,
      isVideo,
      senderTabId: tabSessionId,
    },
  });
}

export async function answerCall(
  callerId: string,
  roomName: string,
  isVideo: boolean = true
) {
  await initWebRTC();

  currentCallPeerId = callerId;
  currentRoomName = roomName;

  mountJitsi(currentRoomName, isVideo);

  callChannel.send({
    type: "broadcast",
    event: "call-answer",
    payload: { targetUserId: callerId, senderTabId: tabSessionId },
  });
}

let isEndingCall = false;

export async function endVideoCall(broadcast = true) {
  if (isEndingCall) return;
  isEndingCall = true;
  try {
    stopRingtone();
    if (broadcast && currentCallPeerId && callChannel) {
      callChannel.send({
        type: "broadcast",
        event: "call-ended",
        payload: {
          targetUserId: currentCallPeerId,
          callerId: state.currentUser.id,
          senderTabId: tabSessionId,
        },
      });

      if (state.activeChatId) {
        const content = "Звонок завершен";

        try {
          await supabase.from("messages").insert({
            chat_id: state.activeChatId,
            sender_id: state.currentUser.id,
            content: `📞 ${content}`,
            message_type: "text",
          });
        } catch (e) {
          console.warn("Failed to insert call message:", e);
        }
      }
    }
    
    currentCallPeerId = null;
    currentRoomName = null;

    if (jitsiApi) {
      try {
        jitsiApi.dispose();
      } catch (e) {}
      jitsiApi = null;
    }

    document.getElementById("video-call-modal")!.classList.add("hidden");
    const container = document.getElementById("jitsi-container");
    if (container) container.innerHTML = "";

  } finally {
    isEndingCall = false;
  }
}

export function toggleCallAudio() {
  if (jitsiApi) jitsiApi.executeCommand("toggleAudio");
}

export function toggleCallVideo() {
  if (jitsiApi) jitsiApi.executeCommand("toggleVideo");
}

export async function switchCallCamera() {
  if (jitsiApi) jitsiApi.executeCommand("toggleCamera");
}
