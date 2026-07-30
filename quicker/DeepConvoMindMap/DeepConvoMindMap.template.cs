using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Threading;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Public;

public static string GetBundleVersion()
{
    return "__BUNDLE_VERSION__";
}

public static string GetEmbeddedAppBundle()
{
    return String.Concat(new string[]
    {
__APP_BUNDLE_BASE64__
    });
}

public static string GetDefaultStateJson()
{
    return "{\"version\":1,\"chrome\":{\"app_lang\":\"zh-CN\"},\"idb\":{}}";
}

public static string NormalizeStateJson(string raw)
{
    try
    {
        if (String.IsNullOrWhiteSpace(raw)) return GetDefaultStateJson();
        JObject state = JObject.Parse(raw);
        if (state["version"] == null) state["version"] = 1;
        if (state["chrome"] == null || state["chrome"].Type != JTokenType.Object) state["chrome"] = new JObject();
        if (state["idb"] == null || state["idb"].Type != JTokenType.Object) state["idb"] = new JObject();
        state["chrome"]["app_lang"] = "zh-CN";
        return state.ToString(Formatting.None).Replace("\u2028", "\\u2028").Replace("\u2029", "\\u2029");
    }
    catch
    {
        return GetDefaultStateJson();
    }
}

public static string ReadSavedTheme(string stateJson)
{
    try
    {
        JObject state = JObject.Parse(stateJson);
        string theme = (string)state["chrome"]?["mindmap_theme"];
        return theme == "light" || theme == "dark" ? theme : "";
    }
    catch
    {
        return "";
    }
}

public static void ApplyWebViewTheme(CoreWebView2 core, string theme)
{
    if (theme == "light")
    {
        core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Light;
    }
    else if (theme == "dark")
    {
        core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Dark;
    }
    else
    {
        core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Auto;
    }
}

public static string EnsureApplicationFiles()
{
    string root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Quicker",
        "DeepConvoMindMap",
        "runtime-" + GetBundleVersion());
    string entryPage = Path.Combine(root, "HTML", "MindMap.html");
    if (File.Exists(entryPage)) return root;

    Directory.CreateDirectory(root);
    byte[] compressed = Convert.FromBase64String(GetEmbeddedAppBundle());
    string manifestJson;
    using (MemoryStream input = new MemoryStream(compressed))
    using (GZipStream gzip = new GZipStream(input, CompressionMode.Decompress))
    using (StreamReader reader = new StreamReader(gzip, Encoding.UTF8))
    {
        manifestJson = reader.ReadToEnd();
    }

    JObject manifest = JObject.Parse(manifestJson);
    string rootPrefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
    foreach (JProperty file in manifest.Properties())
    {
        string relativePath = file.Name.Replace('/', Path.DirectorySeparatorChar);
        string destination = Path.GetFullPath(Path.Combine(root, relativePath));
        if (!destination.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("应用资源包含非法路径：" + file.Name);
        }
        string directory = Path.GetDirectoryName(destination);
        if (!String.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        File.WriteAllBytes(destination, Convert.FromBase64String((string)file.Value));
    }

    if (!File.Exists(entryPage)) throw new FileNotFoundException("思维导图入口文件释放失败。", entryPage);
    return root;
}

public static double ReadDoubleVariable(IStepContext context, string key, double fallback)
{
    try
    {
        object value = context.GetVarValue(key);
        if (value == null) return fallback;
        return Convert.ToDouble(value);
    }
    catch
    {
        return fallback;
    }
}

public static bool ReadBoolVariable(IStepContext context, string key, bool fallback)
{
    try
    {
        object value = context.GetVarValue(key);
        if (value == null) return fallback;
        return Convert.ToBoolean(value);
    }
    catch
    {
        return fallback;
    }
}

public static Window CreateMindMapWindow(
    IStepContext context,
    string applicationRoot,
    string initialStateJson,
    ManualResetEventSlim closedSignal)
{
    WebView2 webView = new WebView2();
    webView.CreationProperties = new CoreWebView2CreationProperties
    {
        UserDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Quicker",
            "DeepConvoMindMap",
            "WebView2")
    };
    Window window = new Window
    {
        Title = "思维导图",
        Width = Math.Max(800, ReadDoubleVariable(context, "window_width", 1200)),
        Height = Math.Max(600, ReadDoubleVariable(context, "window_height", 800)),
        MinWidth = 800,
        MinHeight = 600,
        WindowStartupLocation = WindowStartupLocation.CenterScreen,
        WindowStyle = WindowStyle.SingleBorderWindow,
        ResizeMode = ResizeMode.CanResize,
        Content = webView
    };

    double savedLeft = ReadDoubleVariable(context, "window_left", -1);
    double savedTop = ReadDoubleVariable(context, "window_top", -1);
    if (savedLeft >= SystemParameters.VirtualScreenLeft &&
        savedTop >= SystemParameters.VirtualScreenTop &&
        savedLeft < SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth - 100 &&
        savedTop < SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight - 100)
    {
        window.WindowStartupLocation = WindowStartupLocation.Manual;
        window.Left = savedLeft;
        window.Top = savedTop;
    }
    if (ReadBoolVariable(context, "window_maximized", false)) window.WindowState = WindowState.Maximized;

    webView.CoreWebView2InitializationCompleted += async (sender, args) =>
    {
        try
        {
            if (!args.IsSuccess)
            {
                string initializationError = args.InitializationException == null ? "未知错误" : args.InitializationException.ToString();
                context.SetVarValue("errMessage", "WebView2 初始化失败：" + initializationError);
                MessageBox.Show(
                    "WebView2 初始化失败：" + (args.InitializationException == null ? "未知错误" : args.InitializationException.Message),
                    "思维导图",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                return;
            }

            CoreWebView2 core = webView.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(
                "deepconvo-mindmap.local",
                applicationRoot,
                CoreWebView2HostResourceAccessKind.Allow);
            ApplyWebViewTheme(core, ReadSavedTheme(initialStateJson));
            core.WebMessageReceived += (messageSender, messageArgs) =>
            {
                try
                {
                    string message = messageArgs.TryGetWebMessageAsString();
                    const string persistPrefix = "DEEPCONVO_PERSIST:";
                    const string themePrefix = "DEEPCONVO_THEME:";
                    if (message != null && message.StartsWith(persistPrefix, StringComparison.Ordinal))
                    {
                        string payload = NormalizeStateJson(message.Substring(persistPrefix.Length));
                        context.SetVarValue("app_data_json", payload);
                    }
                    else if (message != null && message.StartsWith(themePrefix, StringComparison.Ordinal))
                    {
                        ApplyWebViewTheme(core, message.Substring(themePrefix.Length));
                    }
                }
                catch
                {
                    // 单次持久化失败不会中断编辑；后续写入会再次提交完整状态。
                }
            };

            await core.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.__DEEPCONVO_QUICKER_STATE__ = " + initialStateJson + ";");
            core.Navigate("https://deepconvo-mindmap.local/HTML/MindMap.html");
            context.SetVarValue("rtn", "WEBVIEW_READY");
        }
        catch (Exception ex)
        {
            context.SetVarValue("errMessage", "WebView2 页面加载失败：" + ex.ToString());
            MessageBox.Show(
                "思维导图页面加载失败：" + ex.Message,
                "思维导图",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    };

    window.Closing += (sender, args) =>
    {
        try
        {
            Rect bounds = window.WindowState == WindowState.Normal ?
                new Rect(window.Left, window.Top, window.Width, window.Height) :
                window.RestoreBounds;
            context.SetVarValue("window_width", bounds.Width);
            context.SetVarValue("window_height", bounds.Height);
            context.SetVarValue("window_left", bounds.Left);
            context.SetVarValue("window_top", bounds.Top);
            context.SetVarValue("window_maximized", window.WindowState == WindowState.Maximized);
            if (webView.CoreWebView2 != null)
            {
                webView.ExecuteScriptAsync("window.__DEEPCONVO_EXPORT_QUICKER_STATE__ && window.__DEEPCONVO_EXPORT_QUICKER_STATE__();");
            }
        }
        catch
        {
        }
    };
    window.Closed += (sender, args) =>
    {
        webView.Dispose();
        closedSignal.Set();
    };
    webView.EnsureCoreWebView2Async(null);
    return window;
}

public static void ShowAndActivate(Window window, bool modal)
{
    window.Topmost = true;
    if (modal)
    {
        window.Loaded += (sender, args) =>
        {
            window.Activate();
            window.Topmost = false;
            window.Focus();
        };
        window.ShowDialog();
    }
    else
    {
        window.Show();
        window.Activate();
        window.Topmost = false;
        window.Focus();
    }
}

public static string Exec(IStepContext context)
{
    try
    {
        context.SetVarValue("errMessage", "");
        context.SetVarValue("rtn", "STARTING");
        string applicationRoot = EnsureApplicationFiles();
        string initialStateJson = NormalizeStateJson(context.GetVarValue("app_data_json") as string);
        ManualResetEventSlim closedSignal = new ManualResetEventSlim(false);
        System.Windows.Threading.Dispatcher dispatcher = Application.Current.Dispatcher;

        if (dispatcher.CheckAccess())
        {
            Window window = CreateMindMapWindow(context, applicationRoot, initialStateJson, closedSignal);
            ShowAndActivate(window, true);
        }
        else
        {
            dispatcher.Invoke(() =>
            {
                Window window = CreateMindMapWindow(context, applicationRoot, initialStateJson, closedSignal);
                ShowAndActivate(window, false);
            });
            closedSignal.Wait();
        }

        closedSignal.Dispose();
        return "OK";
    }
    catch (Exception ex)
    {
        context.SetVarValue("errMessage", ex.ToString());
        return "ERROR: " + ex.Message;
    }
}
