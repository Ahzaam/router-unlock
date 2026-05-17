import { Download, MonitorPlay, ShieldAlert, Globe, Keyboard, Usb, CheckCircle2 } from "lucide-react";

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-terminal-green">Setup Guide</h1>
          <p className="text-xl text-gray-400">Follow these simple steps to help your friend connect to your router.</p>
        </div>

        <div className="space-y-8">
          {/* Main Download Step */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 md:p-12 flex flex-col items-center text-center relative overflow-hidden group hover:border-blue-500/30 transition-all shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-bl-full -z-10 group-hover:bg-blue-500/10 transition-colors"></div>
            
            <div className="bg-blue-600/20 text-blue-400 w-20 h-20 rounded-full flex items-center justify-center mb-8 border border-blue-500/30 shadow-inner">
              <Download className="w-10 h-10" />
            </div>

            <h2 className="text-3xl font-black mb-4 tracking-tight">Step 1: Download & Run</h2>
            <p className="text-gray-400 text-lg mb-8 max-w-md">
              Download the Router Agent app and run it on your Windows computer. It will automatically set up everything for you.
            </p>

            <a
              href="./RouterAgent.exe"
              className="inline-flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-10 rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-95 text-lg"
            >
              <Download className="w-6 h-6" />
              Download RouterAgent.exe
            </a>

            <div className="mt-10 bg-gray-950 border border-yellow-900/30 rounded-2xl p-6 max-w-lg">
              <div className="flex gap-4 items-start text-left">
                <ShieldAlert className="w-6 h-6 text-yellow-500 shrink-0 mt-1" />
                <div>
                  <p className="font-bold text-yellow-500 mb-1">Windows Protection:</p>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    If Windows shows a warning, click <strong className="text-white">"More info"</strong> and then <strong className="text-white">"Run anyway"</strong>. This is normal for new helper apps.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Success / Next Steps */}
          <div className="bg-terminal-green/5 border border-terminal-green/20 rounded-3xl p-8 flex flex-col md:flex-row gap-8 items-center">
            <div className="bg-terminal-green/10 p-5 rounded-2xl">
              <Usb className="w-10 h-10 text-terminal-green" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-bold text-white mb-2">Automated Setup</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Once the app is running, it will automatically open your browser and connect to your friend. 
                <span className="text-terminal-green font-bold block mt-1">Just keep the app and browser window open.</span>
              </p>
            </div>
            <CheckCircle2 className="w-12 h-12 text-terminal-green hidden md:block opacity-50" />
          </div>
        </div>

        {/* Share Button */}
        <div className="mt-12 text-center">
          <a
            href={`https://wa.me/?text=Hey!%20Follow%20these%20steps%20to%20connect%20the%20router:%20${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-8 rounded-xl transition-colors shadow-lg shadow-[#25D366]/20"
          >
            Share this Guide on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
