import SwiftUI
import WebKit

/// Les callbacks WebKit (KVO, evaluateJavaScript) arrivent sur le main thread mais
/// sans isolation d'acteur. Ce sas les ramène proprement sur le MainActor.
private func onMainActor(_ work: @escaping @MainActor () -> Void) {
    if Thread.isMainThread {
        MainActor.assumeIsolated { work() }
    } else {
        DispatchQueue.main.async { MainActor.assumeIsolated { work() } }
    }
}

// MARK: - État partagé

@MainActor
final class WebViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var progress: Double = 0
    @Published var loadError: Error?
    @Published var canGoBack = false

    weak var webView: WKWebView?

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

// MARK: - Pont SwiftUI ↔ WKWebView

struct WebView: UIViewRepresentable {
    @ObservedObject var model: WebViewModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        // Store persistant : la session admin survit à la fermeture de l'app.
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Theme.background)
        webView.scrollView.backgroundColor = UIColor(Theme.background)
        webView.scrollView.contentInsetAdjustmentBehavior = .never

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

        /// Présente depuis le view controller qui héberge la WKWebView.
        /// `fallback` libère le completionHandler de WebKit si rien n'est présentable
        /// (sinon la page web reste bloquée indéfiniment).
        private func present(
            _ alert: UIAlertController,
            from webView: WKWebView,
            fallback: @escaping () -> Void
        ) {
            var responder: UIResponder? = webView
            while let current = responder, !(current is UIViewController) {
                responder = current.next
            }
            guard var controller = responder as? UIViewController else {
                fallback()
                return
            }
            while let presented = controller.presentedViewController {
                controller = presented
            }
            controller.present(alert, animated: true)
        }
    }
}
