"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Router as RouterIcon, ArrowRight, Download, HelpCircle } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#0a0a0a] text-white overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-terminal-green rounded-full blur-[120px]"></div>
      </div>

      <div className="mb-16 text-center relative z-10">
        <div className="inline-flex items-center justify-center p-4 bg-gray-900 rounded-2xl border border-gray-800 mb-6 shadow-2xl">
          <Plug className="w-12 h-12 text-terminal-green" />
        </div>
        <h1 className="text-5xl md:text-6xl font-black mb-4 tracking-tighter">
          Router Remote Tool
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-md mx-auto leading-relaxed">
          The ultimate platform for remote router unlocking and configuration.
        </p>
      </div>

      <div className="w-full max-w-2xl relative z-10">
        <div className="bg-gray-900/80 border border-gray-800 rounded-[3rem] p-8 md:p-16 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl text-center">
          
          <div className="bg-blue-600/10 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-10 border border-blue-500/20 shadow-inner">
            <Download className="w-12 h-12 text-blue-400" />
          </div>

          <h2 className="text-4xl font-black mb-6 tracking-tight">Get Started</h2>
          <p className="text-gray-400 text-lg mb-12 max-w-md mx-auto leading-relaxed">
            Download the Router Agent to begin. Your friend will handle the rest once the app is running.
          </p>

          <div className="space-y-6">
            <a
              href="./RouterAgent.exe"
              className="group bg-blue-600 hover:bg-blue-500 text-white font-black py-6 px-10 rounded-2xl w-full flex items-center justify-center gap-4 transition-all active:scale-[0.98] shadow-2xl shadow-blue-600/20 text-xl"
            >
              <span>Download RouterAgent.exe</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </a>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6">
              <Link 
                href="/guide" 
                className="bg-gray-800/50 hover:bg-gray-800 text-white py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all text-sm font-bold border border-gray-700/50"
              >
                <HelpCircle className="w-4 h-4 text-blue-400" />
                Detailed Setup Guide
              </Link>
              <div className="bg-gray-800/30 text-gray-500 py-4 px-6 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold border border-gray-800/50">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                Windows 10 / 11 Ready
              </div>
            </div>
          </div>
        </div>
        
        <p className="mt-12 text-center text-gray-700 text-xs uppercase tracking-[0.2em] font-black opacity-40">
          Automated Signaling &bull; Secure Serial Tunneling &bull; P2P Video
        </p>
      </div>

      {/* Secret Admin Link */}
      <Link 
        href="/admin" 
        className="fixed bottom-8 right-8 text-gray-800 hover:text-gray-600 transition-colors"
        title="Admin Login"
      >
        <Shield className="w-5 h-5 opacity-20" />
      </Link>
    </main>
  );
}

function Shield(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  );
}
