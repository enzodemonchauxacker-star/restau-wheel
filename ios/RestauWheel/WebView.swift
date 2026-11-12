import SwiftUI
import WebKit
import PassKit

/// Les callbacks WebKit arrivent souvent au milieu d’une mise à jour SwiftUI.
/// On reporte toujours au tour suivant : publier un @Published dans le tour
/// en cours déclenche « Publishing changes from within view updates ».
private func onMainActor(_ work: @escaping @MainActor () -> Void) {
    DispatchQueue.main.async {
        MainActor.assumeIsolated { work() }
    }
}

// MARK: - État partagé

@MainActor
final class WebViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var progress: Double = 0
    @Published var loadError: Error?
    @Published var canGoBack = false
    /// Le tableau de bord (ou la porte de connexion) est peint. L’animation native peut partir.
    @Published var contentReady = false

    weak var webView: WKWebView?
    private var probing = false

    func probeContentReady() {
        guard !contentReady, !probing, let webView else { return }
        probing = true
        webView.evaluateJavaScript("document.documentElement.dataset.rwReady || ''") { [weak self] value, _ in
            onMainActor {
                guard let self else { return }
                self.probing = false
                if (value as? String) == "1" {
                    self.contentReady = true
                }
            }
        }
    }

    func goBack() {
        loadError = nil
        webView?.goBack()
    }

    func reload() {
        loadError = nil
        guard let webView else { return }
        if webView.url == nil {
            webView.load(URLRequest(url: AppConfig.startURL))
        } else {
            webView.reload()
        }
    }

    func goHome() {
        loadError = nil
        webView?.load(URLRequest(url: AppConfig.startURL))
    }
}

// Le CSS lit --native-sat / --native-sab, puis décide du décalage.
private final class InsetWebView: WKWebView {
    var onInsets: (() -> Void)?
    private var applied = UIEdgeInsets(top: -1, left: 0, bottom: 0, right: 0)

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        report()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        report()
    }

    private func report() {
        let insets = safeAreaInsets
        guard insets != applied else { return }
        applied = insets
        onInsets?()
    }
}

// MARK: - Pont SwiftUI ↔ WKWebView

struct WebView: UIViewRepresentable {
    @ObservedObject var model: WebViewModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        // Store persistant : la session admin survit à la fermeture de l'app.
        configuration.websiteDataStore = .default()
        // L’animation de la roue est native : la page ne rejoue pas la sienne.
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: "document.documentElement.dataset.native='1';",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let webView = InsetWebView(frame: .zero, configuration: configuration)
        webView.onInsets = { [weak webView] in
            guard let webView else { return }
            context.coordinator.publishSafeArea(webView)
        }
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = true
        webView.backgroundColor = UIColor(Theme.background)
        webView.underPageBackgroundColor = UIColor(Theme.background)
        webView.scrollView.backgroundColor = UIColor(Theme.background)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.automaticallyAdjustsScrollIndicatorInsets = false

        let refresh = UIRefreshControl()
        refresh.tintColor = UIColor(Theme.gold)
        refresh.addTarget(
            context.coordinator,
            action: #selector(Coordinator.handleRefresh(_:)),
            for: .valueChanged
        )
        webView.scrollView.refreshControl = refresh

        context.coordinator.startObserving(webView)
        model.webView = webView
        webView.load(URLRequest(url: AppConfig.startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    // MARK: Coordinator

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let model: WebViewModel
        private var observations: [NSKeyValueObservation] = []

        init(model: WebViewModel) {
            self.model = model
        }

        func startObserving(_ webView: WKWebView) {
            observations = [
                webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
                    let value = webView.estimatedProgress
                    onMainActor { self?.model.progress = value }
                },
                webView.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
                    let value = webView.isLoading
                    onMainActor { self?.model.isLoading = value }
                },
                webView.observe(\.canGoBack, options: [.new, .initial]) { [weak self] webView, _ in
                    let value = webView.canGoBack
                    onMainActor { self?.model.canGoBack = value }
                },
            ]
        }

        @objc func handleRefresh(_ sender: UIRefreshControl) {
            model.loadError = nil
            model.webView?.reload()
        }

        private func endRefreshing(_ webView: WKWebView) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        // MARK: Routage des navigations

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            if url.pathExtension.lowercased() == "pkpass" {
                decisionHandler(.cancel)
                addAppleWalletPass(from: url)
                return
            }

            switch url.scheme?.lowercased() {
            case "http", "https":
                if AppConfig.isInternal(url) {
                    decisionHandler(.allow)
                    return
                }
                // Lien externe ouvert par l'utilisateur → Safari.
                // Les sous-ressources (polices Google, iframes) restent autorisées.
                if navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil {
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }

            case "mailto", "tel", "sms", "facetime", "maps":
                UIApplication.shared.open(url)
                decisionHandler(.cancel)

            case "about", "blob", "data", "javascript", nil:
                decisionHandler(.allow)

            default:
                // apple-pay, itms-apps, schémas d'apps tierces…
                if UIApplication.shared.canOpenURL(url) {
                    UIApplication.shared.open(url)
                }
                decisionHandler(.cancel)
            }
        }

        /// `target="_blank"` : WKWebView ne crée pas de fenêtre, il faut router à la main.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                if AppConfig.isInternal(url) {
                    webView.load(navigationAction.request)
                } else {
                    UIApplication.shared.open(url)
                }
            }
            return nil
        }

        // MARK: Cycle de chargement

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            endRefreshing(webView)
            model.loadError = nil
            publishSafeArea(webView)
        }

        /// env() reste à 0 sur certains WKWebView : on publie les insets réels.
        func publishSafeArea(_ webView: WKWebView) {
            let insets = webView.safeAreaInsets
            let js = "document.documentElement.style.setProperty('--native-sat','\(insets.top)px');document.documentElement.style.setProperty('--native-sab','\(insets.bottom)px');if(window.__rwFit)window.__rwFit();"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            handleFailure(error, on: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handleFailure(error, on: webView)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        private func handleFailure(_ error: Error, on webView: WKWebView) {
            endRefreshing(webView)
            let error = error as NSError
            // -999 : navigation remplacée par une autre, ce n'est pas une panne.
            guard error.code != NSURLErrorCancelled else { return }
            model.loadError = error
        }

        // MARK: Dialogues JavaScript
        // Sans ces trois méthodes, alert() ne s'affiche pas et confirm() renvoie
        // toujours false — la suppression d'un lot dans /admin ne marcherait jamais.

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            present(alert, from: webView) { completionHandler() }
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            present(alert, from: webView) { completionHandler(false) }
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptTextInputPanelWithPrompt prompt: String,
            defaultText: String?,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (String?) -> Void
        ) {
            let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
                completionHandler(alert?.textFields?.first?.text)
            })
            present(alert, from: webView) { completionHandler(nil) }
        }

        private func addAppleWalletPass(from url: URL) {
            Task {
                do {
                    let (data, response) = try await URLSession.shared.data(from: url)
                    if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                        throw URLError(.cannotParseResponse)
                    }
                    let pass = try PKPass(data: data)
                    await MainActor.run {
                        guard PKAddPassesViewController.canAddPasses(),
                              let addVC = PKAddPassesViewController(pass: pass),
                              let webView = model.webView
                        else { return }
                        presentController(addVC, from: webView)
                    }
                } catch {
                    await MainActor.run {
                        guard let webView = model.webView else { return }
                        let alert = UIAlertController(
                            title: "Apple Wallet",
                            message: "Impossible d’ajouter la carte pour le moment.",
                            preferredStyle: .alert
                        )
                        alert.addAction(UIAlertAction(title: "OK", style: .default))
                        present(alert, from: webView) {}
                    }
                }
            }
        }

        private func presentController(_ controller: UIViewController, from webView: WKWebView) {
            guard let host = hostController(from: webView) else { return }
            host.present(controller, animated: true)
        }

        private func hostController(from webView: WKWebView) -> UIViewController? {
            var responder: UIResponder? = webView
            while let current = responder, !(current is UIViewController) {
                responder = current.next
            }
            guard var controller = responder as? UIViewController else { return nil }
            while let presented = controller.presentedViewController {
                controller = presented
            }
            return controller
        }

        /// Présente depuis le view controller qui héberge la WKWebView.
        /// `fallback` libère le completionHandler de WebKit si rien n'est présentable
        /// (sinon la page web reste bloquée indéfiniment).
        private func present(
            _ alert: UIAlertController,
            from webView: WKWebView,
            fallback: @escaping () -> Void
        ) {
            guard let controller = hostController(from: webView) else {
                fallback()
                return
            }
            controller.present(alert, animated: true)
        }
    }
}
