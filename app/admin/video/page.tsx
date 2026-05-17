"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function VideoCallContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  if (!code) return <div className="p-8 text-white">Invalid session code.</div>;

  const jitsiUrl = `https://jitsi.riot.im/RouterUnlock_Secure_Session_${code}#userInfo.displayName="Admin Support"&config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.requireDisplayName=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&config.p2p.enabled=true&config.disableDeepLinking=true&interfaceConfig.ALPHAVIEW_EXIT_TIMEOUT=0`;

  return (
    <div className="h-screen bg-black flex flex-col">
      <div className="bg-gray-900 p-4 border-b border-gray-800 flex justify-between items-center">
        <h1 className="text-white font-bold tracking-tight">Admin Video Support — {code}</h1>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-gray-400 text-xs font-mono">ENCRYPTED STREAM</span>
        </div>
      </div>
      <iframe 
        src={jitsiUrl} 
        allow="camera; microphone; display-capture; autoplay; clipboard-write; encrypted-media" 
        className="flex-1 w-full border-none"
      />
    </div>
  );
}

export default function AdminVideoPage() {
  return (
    <Suspense fallback={<div className="bg-black h-screen text-white p-8">Loading Video Stream...</div>}>
      <VideoCallContent />
    </Suspense>
  );
}
