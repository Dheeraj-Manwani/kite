/**
 * Read-only Windows UI Automation sidecar, hosted by the inbox Windows PowerShell 5.1.
 * Newline-delimited JSON over stdio: {"id":1,"op":"ping"|"snapshot",...}. It reads names, roles,
 * rectangles and navigation state; it has no code path that invokes patterns or sends input.
 * Output is ASCII (non-ASCII is \u-escaped) so console code pages cannot corrupt names.
 * Keep this ASCII-only: Windows PowerShell reads BOM-less scripts in the ANSI code page.
 */
export const uiaScript = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Web.Extensions
$references = @(
  [System.Windows.Automation.AutomationElement].Assembly.Location,
  [System.Windows.Automation.ControlType].Assembly.Location,
  [System.Windows.Rect].Assembly.Location,
  [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location
)
Add-Type -ReferencedAssemblies $references -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Automation;
using System.Web.Script.Serialization;

namespace KiteGuide {
  public static class Sidecar {
    delegate bool EnumProc(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint command);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int size);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);

    const uint Popup = 0x80000000, Caption = 0x00C00000;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
    static string awareness = "unaware";
    static readonly ControlType[] Interactive = {
      ControlType.Button, ControlType.SplitButton, ControlType.MenuItem, ControlType.TabItem, ControlType.Hyperlink,
      ControlType.CheckBox, ControlType.RadioButton, ControlType.ComboBox, ControlType.Edit, ControlType.ListItem,
      ControlType.TreeItem, ControlType.Text, ControlType.Document, ControlType.Slider, ControlType.Spinner,
    };

    public static void Run() {
      awareness = Aware();
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        object id = null; string reply;
        try {
          var request = Json.DeserializeObject(line) as Dictionary<string, object>;
          if (request == null || !request.ContainsKey("op")) throw new ArgumentException("request");
          if (request.ContainsKey("id")) id = request["id"];
          string op = request["op"] as string;
          Dictionary<string, object> result;
          if (op == "ping") result = new Dictionary<string, object> { { "awareness", awareness } };
          else if (op == "snapshot") result = Snapshot(Number(request, "excludePid", 0), Number(request, "limit", 800), Number(request, "hwnd", 0));
          else throw new ArgumentException("op");
          result["id"] = id; result["ok"] = true;
          reply = Json.Serialize(result);
        } catch (Exception error) {
          reply = Json.Serialize(new Dictionary<string, object> { { "id", id }, { "ok", false }, { "error", Code(error) } });
        }
        Console.Out.WriteLine(Ascii(reply));
        Console.Out.Flush();
      }
    }

    // Physical per-monitor coordinates; the main process converts them to DIP.
    static string Aware() {
      try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return "process"; } catch (Exception) { }
      try { if (SetThreadDpiAwarenessContext(new IntPtr(-4)) != IntPtr.Zero) return "thread"; } catch (Exception) { }
      return "unaware";
    }

    static int Number(Dictionary<string, object> request, string key, int fallback) {
      object value;
      if (!request.TryGetValue(key, out value)) return fallback;
      if (value is int) return (int)value;
      if (value is long) return unchecked((int)(long)value);
      return fallback;
    }

    static string Code(Exception error) {
      if (error is ElementNotAvailableException) return "EGONE";
      if (error is TimeoutException) return "ETIMEOUT";
      if (error is InvalidOperationException && error.Message.Length > 1 && error.Message[0] == 'E') return error.Message;
      if (error is ArgumentException) return "EREQUEST";
      return "EUIA";
    }

    static string Ascii(string text) {
      var output = new StringBuilder(text.Length);
      foreach (char c in text) {
        if (c < 127) output.Append(c); else output.Append("\\u").Append(((int)c).ToString("x4"));
      }
      return output.ToString();
    }

    static string ClassOf(IntPtr hwnd) { var name = new StringBuilder(256); GetClassName(hwnd, name, name.Capacity); return name.ToString(); }

    static bool OwnedBy(IntPtr hwnd, IntPtr owner) {
      for (int depth = 0; depth < 6 && hwnd != IntPtr.Zero; depth++) {
        hwnd = GetWindow(hwnd, 4);
        if (hwnd == owner) return true;
      }
      return false;
    }

    static Dictionary<string, object> Snapshot(int excludePid, int limit, int requested) {
      var clock = Stopwatch.StartNew();
      IntPtr foreground = requested != 0 ? new IntPtr(requested) : GetForegroundWindow();
      if (foreground == IntPtr.Zero || !IsWindow(foreground)) throw new InvalidOperationException("ENOWINDOW");
      IntPtr root = GetAncestor(foreground, 2);
      if (root != IntPtr.Zero) foreground = root;
      uint pid; GetWindowThreadProcessId(foreground, out pid);
      if ((int)pid == excludePid) throw new InvalidOperationException("EKITE");
      // Menus, galleries and drop-downs are separate top-level windows above their owner.
      var windows = new List<IntPtr>();
      bool above = true;
      EnumWindows((hwnd, data) => {
        if (hwnd == foreground) { windows.Add(hwnd); above = false; return true; }
        uint owner; GetWindowThreadProcessId(hwnd, out owner);
        if (owner != pid || !IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
        uint style = unchecked((uint)GetWindowLong(hwnd, -16));
        bool popup = (style & Popup) != 0 && (style & Caption) != Caption;
        if (OwnedBy(hwnd, foreground) || ClassOf(hwnd) == "#32768" || (above && popup)) windows.Add(hwnd);
        return true;
      }, IntPtr.Zero);
      var conditions = new List<Condition>();
      foreach (var type in Interactive) conditions.Add(new PropertyCondition(AutomationElement.ControlTypeProperty, type));
      var filter = new AndCondition(new PropertyCondition(AutomationElement.IsOffscreenProperty, false), new OrCondition(conditions.ToArray()));
      var cache = new CacheRequest { AutomationElementMode = AutomationElementMode.None, TreeScope = TreeScope.Element };
      foreach (var property in new[] { AutomationElement.NameProperty, AutomationElement.ControlTypeProperty, AutomationElement.BoundingRectangleProperty,
        AutomationElement.AutomationIdProperty, AutomationElement.IsEnabledProperty, AutomationElement.HelpTextProperty,
        SelectionItemPattern.IsSelectedProperty, ExpandCollapsePattern.ExpandCollapseStateProperty }) cache.Add(property);
      var elements = new List<Dictionary<string, object>>();
      Dictionary<string, object> window = null;
      for (int layer = 0; layer < windows.Count; layer++) {
        AutomationElement top;
        try { top = AutomationElement.FromHandle(windows[layer]); } catch (Exception) { continue; }
        if (windows[layer] == foreground) {
          string process = "";
          try { process = Process.GetProcessById((int)pid).ProcessName; } catch (Exception) { }
          window = new Dictionary<string, object> { { "title", Clip(top.Current.Name, 200) }, { "process", process }, { "pid", (int)pid }, { "rect", Box(top.Current.BoundingRectangle) } };
        }
        AutomationElementCollection found;
        try { using (cache.Activate()) found = top.FindAll(TreeScope.Descendants, filter); }
        catch (ElementNotAvailableException) { continue; }
        foreach (AutomationElement element in found) {
          Rect rect = element.Cached.BoundingRectangle;
          if (rect.IsEmpty || rect.Width < 2 || rect.Height < 2) continue;
          var item = new Dictionary<string, object> {
            { "name", Clip(element.Cached.Name, 200) }, { "role", element.Cached.ControlType.ProgrammaticName.Replace("ControlType.", "") },
            { "automationId", Clip(element.Cached.AutomationId, 100) }, { "help", Clip(element.Cached.HelpText, 200) },
            { "enabled", element.Cached.IsEnabled }, { "layer", layer }, { "rect", Box(rect) },
          };
          object selected = element.GetCachedPropertyValue(SelectionItemPattern.IsSelectedProperty, true);
          if (selected is bool) item["selected"] = selected;
          object state = element.GetCachedPropertyValue(ExpandCollapsePattern.ExpandCollapseStateProperty, true);
          if (state is ExpandCollapseState) item["expanded"] = (ExpandCollapseState)state == ExpandCollapseState.Expanded || (ExpandCollapseState)state == ExpandCollapseState.PartiallyExpanded;
          elements.Add(item);
        }
      }
      if (window == null) throw new InvalidOperationException("ENOWINDOW");
      if (elements.Count > limit) {
        // Keep named controls first; unnamed ones only help verify vision boxes.
        var named = elements.FindAll(e => ((string)e["name"]).Length > 0);
        named.AddRange(elements.FindAll(e => ((string)e["name"]).Length == 0));
        elements = named.GetRange(0, limit);
      }
      return new Dictionary<string, object> { { "window", window }, { "elements", elements }, { "ms", (int)clock.ElapsedMilliseconds } };
    }

    static string Clip(string value, int max) { value = value ?? ""; return value.Length > max ? value.Substring(0, max) : value; }
    static int[] Box(Rect rect) {
      if (rect.IsEmpty) return new[] { 0, 0, 0, 0 };
      return new[] { (int)Math.Round(rect.X), (int)Math.Round(rect.Y), (int)Math.Round(rect.Width), (int)Math.Round(rect.Height) };
    }
  }
}
'@
[KiteGuide.Sidecar]::Run()
`;
