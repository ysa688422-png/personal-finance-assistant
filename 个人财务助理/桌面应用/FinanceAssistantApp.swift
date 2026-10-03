import AppKit
import Darwin
import Foundation
import WebKit

private let serverAddress = URL(string: "http://127.0.0.1:4188/")!
private let startupLimit: TimeInterval = 120

final class FinanceAssistantApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    private enum State {
        case starting
        case ready
        case failed
    }

    private var state: State = .starting
    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var detailLabel: NSTextField!
    private var webView: WKWebView?
    private var ownedServer: Process?
    private var outputPipe: Pipe?
    private var startupTimer: DispatchSourceTimer?
    private var startupHintTimer: DispatchSourceTimer?
    private var probeTimer: DispatchSourceTimer?
    private var probeInFlight = false
    private var launchAttempted = false
    private var stoppingServer = false
    private let outputLock = NSLock()
    private var recentOutput = ""

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenu()
        makeWindow()
        NSApp.activate(ignoringOtherApps: true)
        startBoundedWait()
        showStatus("正在连接本机财务助理…", "如 macOS 请求访问“文稿”文件夹，请选择“允许”。首次启动最多等待 120 秒；Ollama 由您单独管理。")
        probeServer { [weak self] available in
            guard let self = self, self.state == .starting else { return }
            if available {
                self.showFailure("已有其他来源启动的财务助理服务", "端口 4188 已有服务运行。本窗口不能安全接管或关闭它；请先关闭原服务，再重新打开此应用。")
            } else {
                self.launchServerOnce()
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.contains(where: { $0.scheme == "sayi-finance-assistant" }) else { return }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func windowWillClose(_ notification: Notification) {
        stopOwnedServer()
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopOwnedServer()
    }

    private func installMenu() {
        let menu = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "退出洒一财务助理", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu
    }

    private func makeWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1080, height: 740),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "洒一财务助理"
        window.minSize = NSSize(width: 720, height: 520)
        window.center()
        window.delegate = self

        installStatusView()
        window.makeKeyAndOrderFront(nil)
    }

    private func installStatusView() {
        let view = NSView(frame: window.contentView?.bounds ?? .zero)
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        statusLabel = NSTextField(labelWithString: "正在启动…")
        statusLabel.font = .systemFont(ofSize: 22, weight: .semibold)
        statusLabel.alignment = .center
        statusLabel.lineBreakMode = .byWordWrapping
        statusLabel.maximumNumberOfLines = 0

        detailLabel = NSTextField(labelWithString: "")
        detailLabel.font = .systemFont(ofSize: 14)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.alignment = .center
        detailLabel.lineBreakMode = .byWordWrapping
        detailLabel.maximumNumberOfLines = 0
        detailLabel.isSelectable = true

        let stack = NSStackView(views: [statusLabel, detailLabel])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.8),
            stack.widthAnchor.constraint(greaterThanOrEqualToConstant: 380)
        ])
        window.contentView = view
    }

    private func showStatus(_ title: String, _ detail: String) {
        statusLabel.stringValue = title
        detailLabel.stringValue = detail
    }

    private func startBoundedWait() {
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + startupLimit)
        timer.setEventHandler { [weak self] in
            guard let self = self, self.state == .starting else { return }
            self.showFailure("启动超时", "本机服务在 120 秒内没有准备好。请先确认 macOS 已允许本应用访问“文稿”文件夹，再检查财务数据或端口 4188；关闭应用后可手动重试，本应用不会自动重启服务。")
        }
        timer.resume()
        startupTimer = timer

        let hintTimer = DispatchSource.makeTimerSource(queue: .main)
        hintTimer.schedule(deadline: .now() + 25)
        hintTimer.setEventHandler { [weak self] in
            guard let self = self, self.state == .starting, self.launchAttempted else { return }
            self.showStatus("仍在准备本机服务…", "如果出现“文稿”访问授权，请选择“允许”；若未看到提示，请检查它是否被其他窗口遮挡。索引更新也可能需要一些时间。")
        }
        hintTimer.resume()
        startupHintTimer = hintTimer
    }

    private func probeServer(_ completion: @escaping (Bool) -> Void) {
        guard !probeInFlight else { return }
        probeInFlight = true
        var request = URLRequest(url: serverAddress.appendingPathComponent("api/bootstrap"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            let validResponse = (response as? HTTPURLResponse)?.statusCode == 200
            let payload = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let available = validResponse && payload?["token"] is String && payload?["status"] != nil
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.probeInFlight = false
                completion(available)
            }
        }.resume()
    }

    private func launchServerOnce() {
        guard state == .starting, !launchAttempted else { return }
        launchAttempted = true

        let project = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        let script = project.appendingPathComponent("server.py")
        guard FileManager.default.fileExists(atPath: script.path) else {
            showFailure("找不到财务助理服务", "请将应用保留在“个人财务助理/桌面应用”文件夹中，再重新打开。")
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = [script.path, "--no-open"]
        process.currentDirectoryURL = project
        var environment = ProcessInfo.processInfo.environment
        environment["SAYI_FINANCE_PORT"] = "4188"
        process.environment = environment

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                return
            }
            self?.appendOutput(data)
        }
        process.terminationHandler = { [weak self] finished in
            DispatchQueue.main.async {
                guard let self = self, self.state != .failed, !self.stoppingServer else { return }
                let details = self.outputSummary()
                self.showFailure("财务助理服务已退出", "服务已退出（代码 \(finished.terminationStatus)）。\(details)")
            }
        }

        do {
            try process.run()
            ownedServer = process
            outputPipe = pipe
            showStatus("正在启动本机服务…", "如 macOS 弹出“文稿”访问授权，请选择“允许”，否则账本无法读取。服务就绪后会在此窗口显示；Ollama 需单独运行。")
            let timer = DispatchSource.makeTimerSource(queue: .main)
            timer.schedule(deadline: .now() + 0.25, repeating: 0.5)
            timer.setEventHandler { [weak self] in
                guard let self = self, self.state == .starting else { return }
                self.probeServer { [weak self] available in
                    guard let self = self, self.state == .starting else { return }
                    if available && self.ownedServerHasStarted() { self.showWebsite() }
                }
            }
            timer.resume()
            probeTimer = timer
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            showFailure("无法启动本机服务", error.localizedDescription)
        }
    }

    private func appendOutput(_ data: Data) {
        outputLock.lock()
        recentOutput += String(decoding: data, as: UTF8.self)
        if recentOutput.count > 4_000 {
            recentOutput = String(recentOutput.suffix(4_000))
        }
        outputLock.unlock()
    }

    private func outputSummary() -> String {
        outputLock.lock()
        let summary = String(recentOutput.suffix(1_500)).trimmingCharacters(in: .whitespacesAndNewlines)
        outputLock.unlock()
        return summary.isEmpty ? "请确认端口 4188 未被其他程序占用。" : "\n\n\(summary)"
    }

    private func ownedServerHasStarted() -> Bool {
        guard let process = ownedServer, process.isRunning else { return false }
        outputLock.lock()
        let announced = recentOutput.contains("个人财务助理已启动：http://127.0.0.1:4188/")
        outputLock.unlock()
        return announced && process.isRunning
    }

    private func showFailure(_ title: String, _ detail: String) {
        guard state != .failed else { return }
        state = .failed
        stopTimers()
        stopOwnedServer()
        if webView != nil {
            webView?.navigationDelegate = nil
            webView = nil
            installStatusView()
        }
        showStatus(title, detail + "\n\nOllama 是独立程序，本窗口不会强行关闭它。")
    }

    private func showWebsite() {
        guard state == .starting else { return }
        state = .ready
        stopTimers()
        let holder = NSView(frame: window.contentView?.bounds ?? .zero)
        let view = WKWebView(frame: holder.bounds)
        view.translatesAutoresizingMaskIntoConstraints = false
        view.navigationDelegate = self
        view.allowsBackForwardNavigationGestures = true
        let footer = NSTextField(labelWithString: "此窗口只管理自己启动的财务助理服务；Ollama 独立运行，关闭窗口不会退出 Ollama。")
        footer.font = .systemFont(ofSize: 11)
        footer.textColor = .secondaryLabelColor
        footer.alignment = .center
        footer.translatesAutoresizingMaskIntoConstraints = false
        holder.addSubview(view)
        holder.addSubview(footer)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: holder.topAnchor),
            view.leadingAnchor.constraint(equalTo: holder.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: holder.trailingAnchor),
            view.bottomAnchor.constraint(equalTo: footer.topAnchor),
            footer.leadingAnchor.constraint(equalTo: holder.leadingAnchor, constant: 12),
            footer.trailingAnchor.constraint(equalTo: holder.trailingAnchor, constant: -12),
            footer.bottomAnchor.constraint(equalTo: holder.bottomAnchor, constant: -6),
            footer.heightAnchor.constraint(equalToConstant: 22)
        ])
        window.contentView = holder
        webView = view
        view.load(URLRequest(url: serverAddress))
    }

    private func stopTimers() {
        startupTimer?.cancel()
        startupTimer = nil
        startupHintTimer?.cancel()
        startupHintTimer = nil
        probeTimer?.cancel()
        probeTimer = nil
    }

    private func stopOwnedServer() {
        stopTimers()
        stoppingServer = true
        if let process = ownedServer, process.isRunning {
            process.terminate()
            let deadline = Date().addingTimeInterval(2)
            while process.isRunning && Date() < deadline {
                usleep(50_000)
            }
            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
        }
        ownedServer = nil
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == "about" || (url.scheme == "http" && url.host == "127.0.0.1" && url.port == 4188) {
            decisionHandler(.allow)
        } else {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure("页面无法打开", error.localizedDescription)
    }
}

let lockPath = "/tmp/com.sayi.financeassistant.\(getuid()).lock"
let lockDescriptor = open(lockPath, O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW, S_IRUSR | S_IWUSR)
guard lockDescriptor >= 0, flock(lockDescriptor, LOCK_EX | LOCK_NB) == 0 else {
    exit(0)
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let delegate = FinanceAssistantApp()
application.delegate = delegate
application.run()
