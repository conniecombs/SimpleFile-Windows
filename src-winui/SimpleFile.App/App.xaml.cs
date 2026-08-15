using Microsoft.UI.Xaml;

namespace SimpleFile.App;

public partial class App : Application
{
    private Window? _window;

    public App()
    {
        UnhandledException += OnUnhandledException;
        try
        {
            InitializeComponent();
        }
        catch (Exception exception)
        {
            LogCrash("App.InitializeComponent", exception);
            throw;
        }
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            LogCrash("OnLaunched", null);
            _window = new MainWindow();
            _window.Activate();
        }
        catch (Exception exception)
        {
            LogCrash("OnLaunched", exception);
            throw;
        }
    }

    private void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        LogCrash("UnhandledException", e.Exception);
        e.Handled = true;
    }

    internal static void LogCrash(string stage, Exception? exception)
    {
        try
        {
            var directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SimpleFile");
            Directory.CreateDirectory(directory);
            var line = exception is null
                ? $"[{DateTime.Now:O}] {stage}"
                : $"[{DateTime.Now:O}] {stage}{Environment.NewLine}{exception}";
            File.AppendAllText(Path.Combine(directory, "startup.log"), line + Environment.NewLine);
        }
        catch
        {
            // Logging must never take down startup further.
        }
    }
}
