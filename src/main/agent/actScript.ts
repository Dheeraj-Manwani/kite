/**
 * The task agent's UI Automation sidecar, hosted by the inbox Windows PowerShell 5.1 and started only for
 * an approved task. It reads controls like the guide's (read-only) sidecar and can also act, through two
 * channels only: UI Automation patterns (Invoke, Toggle, Select, Expand, SetValue, Scroll, SetFocus) and
 * keyboard input to the task's own window. It has no mouse code at all, so it can never move the pointer,
 * and a unit test enforces that. Newline-delimited JSON over stdio; output is ASCII (\u-escaped).
 * Keep this file ASCII-only and C# 5 (Windows PowerShell compiles it with the in-box compiler).
 */
export const actScript = String.raw`$ErrorActionPreference = 'Stop'
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
using System.Threading;
using System.Windows;
using System.Windows.Automation;
using System.Web.Script.Serialization;

namespace KiteAgent {
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
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, KeyInput[] inputs, int size);

    // Keyboard input only. The union is padded to the size of the largest INPUT member so SendInput accepts it.
    [StructLayout(LayoutKind.Sequential)] struct KeyboardData { public ushort Vk; public ushort Scan; public uint Flags; public uint Time; public IntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct UnionPadding { public int A; public int B; public uint C; public uint D; public uint E; public IntPtr F; }
    [StructLayout(LayoutKind.Explicit)] struct KeyUnion { [FieldOffset(0)] public KeyboardData Key; [FieldOffset(0)] public UnionPadding Padding; }
    [StructLayout(LayoutKind.Sequential)] struct KeyInput { public uint Type; public KeyUnion Data; }
    const uint InputKeyboard = 1, KeyUpFlag = 0x0002, UnicodeFlag = 0x0004, ExtendedFlag = 0x0001;
    const uint Popup = 0x80000000, Caption = 0x00C00000;

    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
    static string awareness = "unaware";
    static List<AutomationElement> cache = new List<AutomationElement>();
    static int seq = 0;
    static readonly ControlType[] Interactive = {
      ControlType.Button, ControlType.SplitButton, ControlType.MenuItem, ControlType.TabItem, ControlType.Hyperlink,
      ControlType.CheckBox, ControlType.RadioButton, ControlType.ComboBox, ControlType.Edit, ControlType.ListItem,
      ControlType.TreeItem, ControlType.Text, ControlType.Document, ControlType.Slider, ControlType.Spinner, ControlType.DataItem,
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
          else if (op == "windows") result = Windows(Number(request, "excludePid", 0));
          else if (op == "snapshot") result = Snapshot(new IntPtr(Number(request, "hwnd", 0)), Number(request, "pid", 0), Number(request, "excludePid", 0), Number(request, "limit", 400));
          else if (op == "act") result = Act(Number(request, "seq", -1), Number(request, "ref", -1), Text(request, "action"), Text(request, "text"), Text(request, "direction"));
          else if (op == "keys") result = Keys(new IntPtr(Number(request, "hwnd", 0)), Number(request, "pid", 0), Number(request, "seq", -1), Number(request, "focus", -1), request.ContainsKey("items") ? request["items"] as object[] : null);
          else if (op == "activate") result = new Dictionary<string, object> { { "active", Activate(new IntPtr(Number(request, "hwnd", 0)), Number(request, "pid", 0)) } };
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
    static string Text(Dictionary<string, object> request, string key) { object value; return request.TryGetValue(key, out value) ? value as string : null; }
    static string Code(Exception error) {
      if (error is ElementNotAvailableException) return "EGONE";
      if (error is TimeoutException) return "ETIMEOUT";
      if (error is InvalidOperationException && error.Message.Length > 1 && error.Message[0] == 'E' && error.Message.ToUpperInvariant() == error.Message) return error.Message;
      if (error is ArgumentException) return "EREQUEST";
      return "EUIA";
    }
    static string Ascii(string text) {
      var output = new StringBuilder(text.Length);
      foreach (char c in text) { if (c < 127) output.Append(c); else output.Append("\\u").Append(((int)c).ToString("x4")); }
      return output.ToString();
    }
    static string Clip(string value, int max) { value = value ?? ""; return value.Length > max ? value.Substring(0, max) : value; }
    static int[] Box(Rect rect) {
      if (rect.IsEmpty) return new[] { 0, 0, 0, 0 };
      return new[] { (int)Math.Round(rect.X), (int)Math.Round(rect.Y), (int)Math.Round(rect.Width), (int)Math.Round(rect.Height) };
    }
    static string ClassOf(IntPtr hwnd) { var name = new StringBuilder(256); GetClassName(hwnd, name, name.Capacity); return name.ToString(); }
    static string TitleOf(IntPtr hwnd) { var text = new StringBuilder(512); GetWindowText(hwnd, text, text.Capacity); return text.ToString(); }
    static uint PidOf(IntPtr hwnd) { uint pid; GetWindowThreadProcessId(hwnd, out pid); return pid; }
    static string ProcessName(uint pid) { try { return Process.GetProcessById((int)pid).ProcessName; } catch (Exception) { return ""; } }
    static bool OwnedBy(IntPtr hwnd, IntPtr owner) {
      for (int depth = 0; depth < 6 && hwnd != IntPtr.Zero; depth++) { hwnd = GetWindow(hwnd, 4); if (hwnd == owner) return true; }
      return false;
    }
    static IntPtr Root(IntPtr hwnd) { IntPtr root = GetAncestor(hwnd, 2); return root != IntPtr.Zero ? root : hwnd; }

    // Top-level app windows the task may target (read-only).
    static Dictionary<string, object> Windows(int excludePid) {
      var list = new List<object>();
      IntPtr foreground = Root(GetForegroundWindow());
      EnumWindows((hwnd, data) => {
        if (!IsWindowVisible(hwnd)) return true;
        uint style = unchecked((uint)GetWindowLong(hwnd, -16)), exStyle = unchecked((uint)GetWindowLong(hwnd, -20));
        if ((style & Caption) != Caption || (exStyle & 0x80) != 0) return true;
        string title = TitleOf(hwnd);
        uint pid = PidOf(hwnd);
        if (title.Length == 0 || (int)pid == excludePid) return true;
        Rect rect = Rect.Empty;
        try { rect = AutomationElement.FromHandle(hwnd).Current.BoundingRectangle; } catch (Exception) { }
        list.Add(new Dictionary<string, object> { { "hwnd", hwnd.ToInt64() }, { "title", Clip(title, 200) }, { "process", ProcessName(pid) }, { "pid", (int)pid },
          { "rect", Box(rect) }, { "foreground", hwnd == foreground }, { "minimized", IsIconic(hwnd) } });
        return list.Count < 200;
      }, IntPtr.Zero);
      return new Dictionary<string, object> { { "windows", list } };
    }

    static Dictionary<string, object> Snapshot(IntPtr requested, int pid, int excludePid, int limit) {
      var clock = Stopwatch.StartNew();
      // The task's window, or whichever window of the same app is in front (a dialog, a new document window).
      IntPtr foreground = Root(GetForegroundWindow());
      IntPtr target = requested;
      if (foreground != IntPtr.Zero && (int)PidOf(foreground) == pid && pid != 0) target = foreground;
      if (target == IntPtr.Zero || !IsWindow(target)) throw new InvalidOperationException("ENOWINDOW");
      target = Root(target);
      uint owner = PidOf(target);
      if ((int)owner == excludePid) throw new InvalidOperationException("EKITE");
      if (pid != 0 && (int)owner != pid) throw new InvalidOperationException("EOTHERAPP");
      var windows = new List<IntPtr>();
      bool above = true;
      EnumWindows((hwnd, data) => {
        if (hwnd == target) { windows.Add(hwnd); above = false; return true; }
        uint other = PidOf(hwnd);
        if (other != owner || !IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
        uint style = unchecked((uint)GetWindowLong(hwnd, -16));
        bool popup = (style & Popup) != 0 && (style & Caption) != Caption;
        if (OwnedBy(hwnd, target) || ClassOf(hwnd) == "#32768" || (above && popup)) windows.Add(hwnd);
        return true;
      }, IntPtr.Zero);
      var conditions = new List<Condition>();
      foreach (var type in Interactive) conditions.Add(new PropertyCondition(AutomationElement.ControlTypeProperty, type));
      var filter = new AndCondition(new PropertyCondition(AutomationElement.IsOffscreenProperty, false), new OrCondition(conditions.ToArray()));
      var request = new CacheRequest { TreeScope = TreeScope.Element };
      foreach (var property in new AutomationProperty[] { AutomationElement.NameProperty, AutomationElement.ControlTypeProperty, AutomationElement.BoundingRectangleProperty,
        AutomationElement.AutomationIdProperty, AutomationElement.IsEnabledProperty, AutomationElement.HelpTextProperty, AutomationElement.HasKeyboardFocusProperty,
        AutomationElement.IsPasswordProperty, AutomationElement.IsInvokePatternAvailableProperty, AutomationElement.IsTogglePatternAvailableProperty,
        AutomationElement.IsSelectionItemPatternAvailableProperty, AutomationElement.IsExpandCollapsePatternAvailableProperty, AutomationElement.IsValuePatternAvailableProperty,
        AutomationElement.IsScrollPatternAvailableProperty, AutomationElement.IsTextPatternAvailableProperty, SelectionItemPattern.IsSelectedProperty, ExpandCollapsePattern.ExpandCollapseStateProperty,
        TogglePattern.ToggleStateProperty, ValuePattern.ValueProperty, ValuePattern.IsReadOnlyProperty }) request.Add(property);
      var found = new List<AutomationElement>();
      var items = new List<Dictionary<string, object>>();
      var layers = new List<object>();
      Dictionary<string, object> window = null;
      for (int layer = 0; layer < windows.Count; layer++) {
        AutomationElement top;
        try { top = AutomationElement.FromHandle(windows[layer]); } catch (Exception) { continue; }
        string title = "";
        try { title = Clip(top.Current.Name, 200); } catch (Exception) { }
        layers.Add(new Dictionary<string, object> { { "layer", layer }, { "title", title }, { "main", windows[layer] == target } });
        if (windows[layer] == target)
          window = new Dictionary<string, object> { { "hwnd", target.ToInt64() }, { "title", title }, { "process", ProcessName(owner) }, { "pid", (int)owner },
            { "rect", Box(top.Current.BoundingRectangle) }, { "foreground", target == foreground } };
        AutomationElementCollection matches;
        try { using (request.Activate()) matches = top.FindAll(TreeScope.Descendants, filter); }
        catch (ElementNotAvailableException) { continue; }
        foreach (AutomationElement element in matches) {
          Rect rect = element.Cached.BoundingRectangle;
          if (rect.IsEmpty || rect.Width < 2 || rect.Height < 2) continue;
          var item = new Dictionary<string, object> {
            { "name", Clip(element.Cached.Name, 200) }, { "role", element.Cached.ControlType.ProgrammaticName.Replace("ControlType.", "") },
            { "automationId", Clip(element.Cached.AutomationId, 100) }, { "help", Clip(element.Cached.HelpText, 200) },
            { "enabled", element.Cached.IsEnabled }, { "layer", layer }, { "rect", Box(rect) },
          };
          bool password = false;
          object value = element.GetCachedPropertyValue(AutomationElement.IsPasswordProperty, true);
          if (value is bool && (bool)value) { password = true; item["password"] = true; }
          value = element.GetCachedPropertyValue(AutomationElement.HasKeyboardFocusProperty, true);
          if (value is bool && (bool)value) item["focused"] = true;
          value = element.GetCachedPropertyValue(SelectionItemPattern.IsSelectedProperty, true);
          if (value is bool) item["selected"] = value;
          value = element.GetCachedPropertyValue(ExpandCollapsePattern.ExpandCollapseStateProperty, true);
          if (value is ExpandCollapseState && (ExpandCollapseState)value != ExpandCollapseState.LeafNode) item["expanded"] = (ExpandCollapseState)value != ExpandCollapseState.Collapsed;
          value = element.GetCachedPropertyValue(TogglePattern.ToggleStateProperty, true);
          if (value is ToggleState) item["toggled"] = (ToggleState)value == ToggleState.On;
          // Never read a password field's contents.
          if (!password) {
            value = element.GetCachedPropertyValue(ValuePattern.ValueProperty, true);
            if (value is string && ((string)value).Length > 0) item["value"] = Clip((string)value, 400);
            // Multi-line fields and documents expose their text through TextPattern instead (read only).
            else if (Flag(element, AutomationElement.IsTextPatternAvailableProperty)) {
              try { string text = ((TextPattern)element.GetCurrentPattern(TextPattern.Pattern)).DocumentRange.GetText(400); if (text.Length > 0) item["value"] = text; } catch (Exception) { }
            }
          }
          value = element.GetCachedPropertyValue(ValuePattern.IsReadOnlyProperty, true);
          if (value is bool && (bool)value) item["readOnly"] = true;
          var patterns = new List<string>();
          if (Flag(element, AutomationElement.IsInvokePatternAvailableProperty)) patterns.Add("invoke");
          if (Flag(element, AutomationElement.IsTogglePatternAvailableProperty)) patterns.Add("toggle");
          if (Flag(element, AutomationElement.IsSelectionItemPatternAvailableProperty)) patterns.Add("select");
          if (Flag(element, AutomationElement.IsExpandCollapsePatternAvailableProperty)) patterns.Add("expand");
          if (Flag(element, AutomationElement.IsValuePatternAvailableProperty)) patterns.Add("value");
          if (Flag(element, AutomationElement.IsScrollPatternAvailableProperty)) patterns.Add("scroll");
          if (Flag(element, AutomationElement.IsTextPatternAvailableProperty)) patterns.Add("text");
          item["patterns"] = patterns;
          found.Add(element); items.Add(item);
        }
      }
      if (window == null) throw new InvalidOperationException("ENOWINDOW");
      var order = new List<int>();
      for (int i = 0; i < items.Count; i++) order.Add(i);
      if (items.Count > limit) {
        // Named or focused controls first; unnamed ones rarely help the model.
        order.Sort((a, b) => Rank(items[a]).CompareTo(Rank(items[b])) != 0 ? Rank(items[a]).CompareTo(Rank(items[b])) : a.CompareTo(b));
        order = order.GetRange(0, limit); order.Sort();
      }
      cache = new List<AutomationElement>(); seq++;
      var elements = new List<object>();
      foreach (int i in order) { items[i]["ref"] = cache.Count; cache.Add(found[i]); elements.Add(items[i]); }
      return new Dictionary<string, object> { { "seq", seq }, { "window", window }, { "layers", layers }, { "elements", elements }, { "ms", (int)clock.ElapsedMilliseconds } };
    }
    static bool Flag(AutomationElement element, AutomationProperty property) { object value = element.GetCachedPropertyValue(property, true); return value is bool && (bool)value; }
    static int Rank(Dictionary<string, object> item) { return item.ContainsKey("focused") ? 0 : ((string)item["name"]).Length > 0 ? 1 : 2; }

    static AutomationElement Element(int requestSeq, int reference) {
      if (requestSeq != seq || reference < 0 || reference >= cache.Count) throw new InvalidOperationException("ESTALE");
      return cache[reference];
    }
    // Some apps run a click handler synchronously (a modal dialog keeps Invoke from returning). Do not wait on that.
    static bool Soon(ThreadStart action) {
      Exception failure = null;
      var thread = new Thread(() => { try { action(); } catch (Exception error) { failure = error; } });
      thread.IsBackground = true; thread.Start();
      if (!thread.Join(2500)) return false;
      if (failure != null) throw failure;
      return true;
    }
    static Dictionary<string, object> Act(int requestSeq, int reference, string action, string text, string direction) {
      var element = Element(requestSeq, reference);
      string via; bool finished = true;
      object pattern;
      if (action == "click") {
        bool tree = element.Current.ControlType == ControlType.TreeItem;
        if (!tree && element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) { var p = (InvokePattern)pattern; via = "invoke"; finished = Soon(() => p.Invoke()); }
        else if (element.TryGetCurrentPattern(TogglePattern.Pattern, out pattern)) { var p = (TogglePattern)pattern; via = "toggle"; finished = Soon(() => p.Toggle()); }
        else if (element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)) {
          var p = (SelectionItemPattern)pattern; via = "select"; finished = Soon(() => p.Select());
          // A tree node is opened as well as selected, the usual intent when navigating folders.
          object expand;
          if (tree && finished && element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out expand) && ((ExpandCollapsePattern)expand).Current.ExpandCollapseState == ExpandCollapseState.Collapsed) {
            var e = (ExpandCollapsePattern)expand; via = "select+expand"; finished = Soon(() => e.Expand());
          }
        }
        else if (element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern)) {
          var p = (ExpandCollapsePattern)pattern; via = "expand";
          finished = Soon(() => { if (p.Current.ExpandCollapseState == ExpandCollapseState.Collapsed) p.Expand(); else p.Collapse(); });
        }
        else if (element.Current.IsKeyboardFocusable) { element.SetFocus(); via = "focus"; }
        else throw new InvalidOperationException("ENOPATTERN");
      } else if (action == "focus") { element.SetFocus(); via = "focus"; }
      else if (action == "selectall") {
        // Select a field's whole text through UI Automation; many edit controls ignore Ctrl+A.
        if (!element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) throw new InvalidOperationException("ENOTEXT");
        element.SetFocus(); ((TextPattern)pattern).DocumentRange.Select(); via = "selectall";
      }
      else if (action == "set") {
        if (text == null) throw new ArgumentException("text");
        if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern) || ((ValuePattern)pattern).Current.IsReadOnly) throw new InvalidOperationException("ENOVALUE");
        if ((bool)element.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty)) throw new InvalidOperationException("EPASSWORD");
        var p = (ValuePattern)pattern; via = "value"; finished = Soon(() => p.SetValue(text));
      } else if (action == "scroll") {
        AutomationElement current = element; ScrollPattern scroll = null;
        for (int depth = 0; depth < 10 && current != null && scroll == null; depth++) {
          if (current.TryGetCurrentPattern(ScrollPattern.Pattern, out pattern)) scroll = (ScrollPattern)pattern;
          else current = TreeWalker.ControlViewWalker.GetParent(current);
        }
        if (scroll == null) throw new InvalidOperationException("ENOSCROLL");
        var h = ScrollAmount.NoAmount; var v = ScrollAmount.NoAmount;
        if (direction == "up") v = ScrollAmount.LargeDecrement; else if (direction == "down") v = ScrollAmount.LargeIncrement;
        else if (direction == "left") h = ScrollAmount.LargeDecrement; else if (direction == "right") h = ScrollAmount.LargeIncrement;
        else throw new ArgumentException("direction");
        if ((v != ScrollAmount.NoAmount && !scroll.Current.VerticallyScrollable) || (h != ScrollAmount.NoAmount && !scroll.Current.HorizontallyScrollable)) throw new InvalidOperationException("ENOSCROLL");
        scroll.Scroll(h, v); via = "scroll";
      } else throw new ArgumentException("action");
      return new Dictionary<string, object> { { "via", via }, { "pending", !finished } };
    }

    static bool Active(int pid) { return pid != 0 && (int)PidOf(GetForegroundWindow()) == pid; }
    // Bring the task's window to the front so keyboard input reaches it and nothing else.
    static bool Activate(IntPtr hwnd, int pid) {
      if (hwnd == IntPtr.Zero || !IsWindow(hwnd) || (int)PidOf(hwnd) != pid) throw new InvalidOperationException("ENOWINDOW");
      if (Active(pid)) return true;
      if (IsIconic(hwnd)) ShowWindow(hwnd, 9);
      uint unused;
      uint thread = GetWindowThreadProcessId(GetForegroundWindow(), out unused), me = GetCurrentThreadId();
      bool attached = thread != 0 && thread != me && AttachThreadInput(me, thread, true);
      try { BringWindowToTop(hwnd); SetForegroundWindow(hwnd); } finally { if (attached) AttachThreadInput(me, thread, false); }
      for (int i = 0; i < 10 && !Active(pid); i++) Thread.Sleep(30);
      if (!Active(pid)) { try { AutomationElement.FromHandle(hwnd).SetFocus(); } catch (Exception) { } for (int i = 0; i < 10 && !Active(pid); i++) Thread.Sleep(30); }
      return Active(pid);
    }
    static bool Held(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
    static KeyInput Key(ushort vk, ushort scan, uint flags) {
      var input = new KeyInput { Type = InputKeyboard };
      input.Data.Key = new KeyboardData { Vk = vk, Scan = scan, Flags = flags, Time = 0, Extra = IntPtr.Zero };
      return input;
    }
    static bool Extended(int vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E; }
    static void Send(List<KeyInput> inputs) {
      if (inputs.Count == 0) return;
      uint sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(KeyInput)));
      if (sent != inputs.Count) throw new InvalidOperationException("EBLOCKED");
    }
    static Dictionary<string, object> Keys(IntPtr hwnd, int pid, int requestSeq, int focus, object[] items) {
      if (items == null || items.Length == 0 || items.Length > 30) throw new ArgumentException("items");
      // Never type while the user holds a modifier: Ctrl+Win (push to talk) plus a letter is a different shortcut.
      foreach (int held in new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }) if (Held(held)) throw new InvalidOperationException("EBUSY");
      if (!Activate(hwnd, pid)) throw new InvalidOperationException("EFOREGROUND");
      if (focus >= 0) { Element(requestSeq, focus).SetFocus(); Thread.Sleep(60); if (!Active(pid)) throw new InvalidOperationException("EFOREGROUND"); }
      int typed = 0;
      foreach (object raw in items) {
        var item = raw as Dictionary<string, object>;
        if (item == null) throw new ArgumentException("item");
        // Re-check before every item: if the user switched apps, stop rather than type into the wrong window.
        if (!Active(pid)) throw new InvalidOperationException("EFOREGROUND");
        var inputs = new List<KeyInput>();
        if (item.ContainsKey("text")) {
          string text = item["text"] as string;
          if (text == null || text.IndexOf('\r') >= 0 || text.IndexOf('\n') >= 0) throw new ArgumentException("text");
          foreach (char c in text) { inputs.Add(Key(0, c, UnicodeFlag)); inputs.Add(Key(0, c, UnicodeFlag | KeyUpFlag)); }
          for (int start = 0; start < inputs.Count; start += 64) { if (!Active(pid)) throw new InvalidOperationException("EFOREGROUND"); Send(inputs.GetRange(start, Math.Min(64, inputs.Count - start))); Thread.Sleep(8); }
          typed += text.Length;
          continue;
        }
        int key = Number(item, "vk", 0), times = Math.Max(1, Math.Min(10, Number(item, "times", 1)));
        if (key <= 0 || key > 0xFE || key == 0x5B || key == 0x5C) throw new ArgumentException("vk");
        var mods = new List<int>();
        if (item.ContainsKey("mods") && item["mods"] is object[]) foreach (object m in (object[])item["mods"]) { int mod = m is int ? (int)m : 0; if (mod != 0x10 && mod != 0x11 && mod != 0x12) throw new ArgumentException("mod"); mods.Add(mod); }
        for (int t = 0; t < times; t++) {
          foreach (int m in mods) inputs.Add(Key((ushort)m, 0, 0));
          inputs.Add(Key((ushort)key, 0, Extended(key) ? ExtendedFlag : 0));
          inputs.Add(Key((ushort)key, 0, (Extended(key) ? ExtendedFlag : 0) | KeyUpFlag));
          for (int i = mods.Count - 1; i >= 0; i--) inputs.Add(Key((ushort)mods[i], 0, KeyUpFlag));
        }
        Send(inputs); Thread.Sleep(40);
      }
      return new Dictionary<string, object> { { "typed", typed } };
    }
  }
}
'@
[KiteAgent.Sidecar]::Run()
`;
