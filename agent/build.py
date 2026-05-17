import os
import subprocess
import sys
import time

def kill_running_agent():
    print("Checking for running instances of RouterAgent.exe...")
    if sys.platform == "win32":
        try:
            subprocess.run(["taskkill", "/F", "/IM", "RouterAgent.exe", "/T"], 
                           capture_output=True, check=False)
            time.sleep(1) # Give it a second to release the file
        except Exception:
            pass

def build():
    print("Building Agent...")
    
    root_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(root_dir, "dist")
    public_dir = os.path.abspath(os.path.join(root_dir, os.pardir, "public"))
    agent_file = os.path.join(root_dir, "agent.py")

    # Kill existing process first
    kill_running_agent()
    
    # Ensure pyinstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
        
    # Install requirements
    print("Installing requirements...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", os.path.join(root_dir, "requirements.txt")])
    
    # Run pyinstaller
    print("Running PyInstaller...")
    subprocess.check_call([
        sys.executable, "-m", "PyInstaller", 
        "--onefile", 
        "--windowed", 
        "--name=RouterAgent", 
        "--distpath", dist_dir,
        agent_file
    ], cwd=root_dir)

    built_exe = os.path.join(dist_dir, "RouterAgent.exe")
    target_exe = os.path.join(public_dir, "RouterAgent.exe")

    if not os.path.exists(public_dir):
        os.makedirs(public_dir, exist_ok=True)

    if os.path.exists(built_exe):
        shutil.copy2(built_exe, target_exe)
        print(f"Build complete! Copied RouterAgent.exe to {target_exe}")
    else:
        print("Build failed: RouterAgent.exe was not found in dist/." )

if __name__ == "__main__":
    build()
