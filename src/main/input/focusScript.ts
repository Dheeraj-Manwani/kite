/** Only window identity and focus are read. Paste is a single guarded Ctrl+V, never arbitrary keys. */
export const focusScript = String.raw`
Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
namespace KiteFocus {
  public static class Native {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, Input[] inputs, int size);
    [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Keyboard key; [FieldOffset(0)] public Mouse mouse; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int x,y; public uint data,flags,time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union data; }
    static IntPtr Root(IntPtr h) { IntPtr root=GetAncestor(h,2); return root==IntPtr.Zero?h:root; }
    static uint Pid(IntPtr h) { uint pid; GetWindowThreadProcessId(h,out pid); return pid; }
    static string Title(IntPtr h) { var s=new StringBuilder(1024); GetWindowText(h,s,s.Capacity); return s.ToString(); }
    static Input Key(ushort key, bool up) { var i=new Input {type=1}; i.data.key=new Keyboard {vk=key,flags=up?2u:0u}; return i; }
    static bool Matches(IntPtr h, int pid, string title, int own) { return IsWindow(h)&&!IsIconic(h)&&pid>0&&pid!=own&&Pid(h)==pid&&Title(h)==title; }
    static bool Activate(IntPtr h, int pid, string title, int own) {
      if (!Matches(h,pid,title,own)) return false;
      IntPtr before=Root(GetForegroundWindow());
      // An intentional switch to another app wins. Only return from Kite to the remembered window.
      if (before!=h&&Pid(before)!=own) return false;
      if (before==h) return true;
      uint unused, thread=GetWindowThreadProcessId(before,out unused), me=GetCurrentThreadId();
      bool attached=thread!=me&&AttachThreadInput(me,thread,true);
      try { BringWindowToTop(h); SetForegroundWindow(h); } finally { if(attached) AttachThreadInput(me,thread,false); }
      return Root(GetForegroundWindow())==h&&Matches(h,pid,title,own);
    }
    public static void Run() {
      var json=new JavaScriptSerializer(); string line;
      while((line=Console.ReadLine())!=null) {
        var reply=new Dictionary<string,object>();
        try {
          var r=json.Deserialize<Dictionary<string,object>>(line); reply["id"]=r["id"]; string op=(string)r["op"];
          if(op=="ping") { reply["awareness"]="unaware"; }
          else {
            int own=Convert.ToInt32(r["excludePid"]);
            if(op=="foreground") {
              IntPtr h=Root(GetForegroundWindow()); uint pid=Pid(h);
              reply["kite"]=pid==own;
              if(h==IntPtr.Zero||pid==0||pid==own||!IsWindow(h)) reply["target"]=null;
              else reply["target"]=new Dictionary<string,object>{{"hwnd",h.ToInt64()},{"pid",pid},{"title",Title(h)},{"process",Process.GetProcessById((int)pid).ProcessName}};
            } else {
              IntPtr h=new IntPtr(Convert.ToInt64(r["hwnd"])); int pid=Convert.ToInt32(r["pid"]); string title=(string)r["title"];
              bool active=Activate(h,pid,title,own);
              if(op=="paste"&&active) {
                foreach(int k in new[]{0x10,0x11,0x12,0x5B,0x5C}) if((GetAsyncKeyState(k)&0x8000)!=0) active=false;
                if(active&&Root(GetForegroundWindow())==h&&Matches(h,pid,title,own)) {
                  var inputs=new[]{Key(0x11,false),Key(0x56,false),Key(0x56,true),Key(0x11,true)};
                  active=SendInput(4,inputs,Marshal.SizeOf(typeof(Input)))==4;
                } else active=false;
              } else if(op!="restore"&&op!="paste") throw new ArgumentException();
              reply["active"]=active;
            }
          }
          reply["ok"]=true;
        } catch { reply["ok"]=false; reply["error"]="EFOCUS"; }
        Console.WriteLine(json.Serialize(reply)); Console.Out.Flush();
      }
    }
  }
}
'@
[KiteFocus.Native]::Run()
`;
