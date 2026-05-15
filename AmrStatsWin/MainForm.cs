using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace AmrStatsWin;

public class MainForm : Form
{
    private readonly TextBox _appIdInput = new();
    private readonly TextBox _appSecretInput = new();
    private readonly TextBox _robotIdInput = new();
    private readonly TextBox _runTimeValue = new();
    private readonly TextBox _distanceValue = new();
    private readonly TextBox _taskCountValue = new();
    private readonly TextBox _totalMileageValue = new();
    private readonly TextBox _totalHoursValue = new();
    private readonly TextBox _ruleRobotIdInput = new();
    private readonly DateTimePicker _ruleTimePicker = new();
    private readonly Label _noticeLabel = new();

    private Process? _nodeProcess;
    private readonly HttpClient _httpClient = new();

    private const string SettingsFileName = "amr-settings.json";
    private const string RulesFileName = "amr-rules.json";

    public MainForm()
    {
        Text = "AMR統計";
        Width = 1100;
        Height = 780;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(20, 28, 36);

        var tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Appearance = TabAppearance.Normal
        };

        tabs.TabPages.Add(BuildApiTab());
        tabs.TabPages.Add(BuildStatsTab());
        tabs.TabPages.Add(BuildRulesTab());

        Controls.Add(tabs);

        Load += (_, _) =>
        {
            LoadSettings();
            LoadRules();
            _ = EnsureServerAsync();
        };

        FormClosing += (_, _) =>
        {
            try
            {
                if (_nodeProcess is { HasExited: false })
                {
                    _nodeProcess.Kill(true);
                }
            }
            catch
            {
                // ignore
            }
        };
    }

    private TabPage BuildApiTab()
    {
        var tab = new TabPage("API") { BackColor = Color.FromArgb(26, 36, 46) };
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Padding = new Padding(20),
            ColumnCount = 2,
            RowCount = 3,
            AutoSize = true
        };

        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 30));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 70));

        layout.Controls.Add(BuildLabel("APP_ID"), 0, 0);
        layout.Controls.Add(_appIdInput, 1, 0);

        layout.Controls.Add(BuildLabel("APP_SECRET"), 0, 1);
        _appSecretInput.UseSystemPasswordChar = true;
        layout.Controls.Add(_appSecretInput, 1, 1);

        var saveButton = BuildButton("儲存");
        saveButton.Click += (_, _) => SaveSettings();
        layout.Controls.Add(saveButton, 1, 2);

        tab.Controls.Add(layout);
        return tab;
    }

    private TabPage BuildStatsTab()
    {
        var tab = new TabPage("統計") { BackColor = Color.FromArgb(26, 36, 46) };
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Padding = new Padding(20),
            ColumnCount = 2,
            RowCount = 9,
            AutoSize = true
        };

        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 30));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 70));

        layout.Controls.Add(BuildLabel("機器人ID"), 0, 0);
        layout.Controls.Add(_robotIdInput, 1, 0);

        layout.Controls.Add(BuildLabel("當日運作時間"), 0, 1);
        layout.Controls.Add(MakeReadOnly(_runTimeValue), 1, 1);

        layout.Controls.Add(BuildLabel("當日行走距離"), 0, 2);
        layout.Controls.Add(MakeReadOnly(_distanceValue), 1, 2);

        layout.Controls.Add(BuildLabel("任務數量"), 0, 3);
        layout.Controls.Add(MakeReadOnly(_taskCountValue), 1, 3);

        layout.Controls.Add(BuildLabel("總里程"), 0, 4);
        layout.Controls.Add(MakeReadOnly(_totalMileageValue), 1, 4);

        layout.Controls.Add(BuildLabel("總任務時數"), 0, 5);
        layout.Controls.Add(MakeReadOnly(_totalHoursValue), 1, 5);

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            FlowDirection = FlowDirection.LeftToRight
        };

        var testButton = BuildButton("測試");
        testButton.Click += async (_, _) => await FetchStatsAsync();
        var executeButton = BuildButton("執行");
        executeButton.Click += (_, _) => _noticeLabel.Text = "已觸發執行（示意）";
        var stopButton = BuildButton("停止");
        stopButton.Click += (_, _) => _noticeLabel.Text = "已觸發停止（示意）";

        buttonPanel.Controls.Add(testButton);
        buttonPanel.Controls.Add(executeButton);
        buttonPanel.Controls.Add(stopButton);

        layout.Controls.Add(buttonPanel, 1, 6);

        _noticeLabel.ForeColor = Color.FromArgb(244, 201, 93);
        _noticeLabel.AutoSize = true;
        layout.Controls.Add(_noticeLabel, 1, 7);

        tab.Controls.Add(layout);
        return tab;
    }

    private TabPage BuildRulesTab()
    {
        var tab = new TabPage("規則") { BackColor = Color.FromArgb(26, 36, 46) };
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Padding = new Padding(20),
            ColumnCount = 2,
            RowCount = 3,
            AutoSize = true
        };

        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 30));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 70));

        layout.Controls.Add(BuildLabel("執行時間"), 0, 0);
        _ruleTimePicker.Format = DateTimePickerFormat.Time;
        _ruleTimePicker.ShowUpDown = true;
        layout.Controls.Add(_ruleTimePicker, 1, 0);

        layout.Controls.Add(BuildLabel("機器人ID"), 0, 1);
        layout.Controls.Add(_ruleRobotIdInput, 1, 1);

        var saveButton = BuildButton("儲存");
        saveButton.Click += (_, _) => SaveRules();
        layout.Controls.Add(saveButton, 1, 2);

        tab.Controls.Add(layout);
        return tab;
    }

    private static Label BuildLabel(string text)
    {
        return new Label
        {
            Text = text,
            ForeColor = Color.Gainsboro,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            AutoSize = true,
            Padding = new Padding(0, 6, 0, 6)
        };
    }

    private static Button BuildButton(string text)
    {
        return new Button
        {
            Text = text,
            Width = 120,
            Height = 34,
            BackColor = Color.FromArgb(52, 66, 82),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
    }

    private static TextBox MakeReadOnly(TextBox box)
    {
        box.ReadOnly = true;
        box.BackColor = Color.FromArgb(32, 42, 54);
        box.ForeColor = Color.Gainsboro;
        return box;
    }

    private async Task FetchStatsAsync()
    {
        var robotId = _robotIdInput.Text.Trim();
        if (string.IsNullOrWhiteSpace(robotId))
        {
            _noticeLabel.Text = "請輸入機器人ID";
            return;
        }

        var payload = new
        {
            robotId,
            appId = _appIdInput.Text.Trim(),
            appSecret = _appSecretInput.Text.Trim()
        };

        try
        {
            var json = JsonSerializer.Serialize(payload);
            var response = await _httpClient.PostAsync("http://localhost:5177/api/stats",
                new StringContent(json, Encoding.UTF8, "application/json"));

            var content = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _noticeLabel.Text = $"錯誤: {content}";
                return;
            }

            using var doc = JsonDocument.Parse(content);
            var root = doc.RootElement;

            var runMs = root.GetProperty("totalRunMs").GetInt64();
            var distance = root.GetProperty("totalMileage").GetDouble();
            var unit = root.GetProperty("mileageUnit").GetString() ?? "km";
            var tasks = root.GetProperty("taskCount").GetInt32();

            _runTimeValue.Text = FormatDuration(runMs);
            _distanceValue.Text = $"{distance:F2} {unit}";
            _taskCountValue.Text = tasks.ToString();
            _totalMileageValue.Text = $"{distance:F2} {unit}";
            _totalHoursValue.Text = $"{runMs / 3600000.0:F2} 小時";
            _noticeLabel.Text = "查詢完成";
        }
        catch (Exception ex)
        {
            _noticeLabel.Text = $"錯誤: {ex.Message}";
        }
    }

    private async Task EnsureServerAsync()
    {
        try
        {
            using var response = await _httpClient.GetAsync("http://localhost:5177/");
            if (response.IsSuccessStatusCode) return;
        }
        catch
        {
            // server not running
        }

        var rootDir = FindServerRoot();
        if (rootDir == null)
        {
            _noticeLabel.Text = "找不到 server.mjs";
            return;
        }

        var psi = new ProcessStartInfo
        {
            FileName = "node",
            Arguments = "server.mjs",
            WorkingDirectory = rootDir,
            CreateNoWindow = true,
            UseShellExecute = false
        };

        try
        {
            _nodeProcess = Process.Start(psi);
            await Task.Delay(500);
        }
        catch (Exception ex)
        {
            _noticeLabel.Text = $"啟動服務失敗: {ex.Message}";
        }
    }

    private static string? FindServerRoot()
    {
        var dir = AppContext.BaseDirectory;
        for (var i = 0; i < 6; i++)
        {
            if (File.Exists(Path.Combine(dir, "server.mjs")))
            {
                return dir;
            }
            var parent = Directory.GetParent(dir);
            if (parent == null) break;
            dir = parent.FullName;
        }
        return null;
    }

    private void LoadSettings()
    {
        var path = Path.Combine(AppContext.BaseDirectory, SettingsFileName);
        if (!File.Exists(path)) return;
        try
        {
            var json = File.ReadAllText(path);
            var data = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
            if (data == null) return;
            _appIdInput.Text = data.TryGetValue("appId", out var appId) ? appId : "";
            _appSecretInput.Text = data.TryGetValue("appSecret", out var appSecret) ? appSecret : "";
        }
        catch
        {
            // ignore
        }
    }

    private void SaveSettings()
    {
        var path = Path.Combine(AppContext.BaseDirectory, SettingsFileName);
        var payload = new Dictionary<string, string>
        {
            ["appId"] = _appIdInput.Text.Trim(),
            ["appSecret"] = _appSecretInput.Text.Trim()
        };
        File.WriteAllText(path, JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
        _noticeLabel.Text = "API 設定已儲存";
    }

    private void LoadRules()
    {
        var path = Path.Combine(AppContext.BaseDirectory, RulesFileName);
        if (!File.Exists(path)) return;
        try
        {
            var json = File.ReadAllText(path);
            var data = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
            if (data == null) return;
            _ruleRobotIdInput.Text = data.TryGetValue("robotId", out var robotId) ? robotId : "";
            if (data.TryGetValue("time", out var timeText) && TimeSpan.TryParse(timeText, out var time))
            {
                _ruleTimePicker.Value = DateTime.Today.Add(time);
            }
        }
        catch
        {
            // ignore
        }
    }

    private void SaveRules()
    {
        var path = Path.Combine(AppContext.BaseDirectory, RulesFileName);
        var payload = new Dictionary<string, string>
        {
            ["robotId"] = _ruleRobotIdInput.Text.Trim(),
            ["time"] = _ruleTimePicker.Value.ToString("HH:mm")
        };
        File.WriteAllText(path, JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
        _noticeLabel.Text = "規則已儲存";
    }

    private static string FormatDuration(long ms)
    {
        var totalSeconds = Math.Max(0, ms / 1000);
        var hours = totalSeconds / 3600;
        var minutes = (totalSeconds % 3600) / 60;
        var seconds = totalSeconds % 60;
        return $"{hours:00}:{minutes:00}:{seconds:00}";
    }
}
