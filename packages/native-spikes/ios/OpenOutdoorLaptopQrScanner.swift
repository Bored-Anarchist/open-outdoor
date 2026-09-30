import AVFoundation
import ExpoModulesCore
import UIKit

/// Camera permission and presentation live on the main queue. Frames are never saved.
internal final class OpenOutdoorLaptopQrScanner {
  private var pending: Promise?
  private var controller: LaptopQrController?
  private var generation = 0

  func scan(_ promise: Promise) {
    guard pending == nil else { promise.reject("QR_BUSY", "A pairing scan is already open."); return }
    generation += 1
    let request = generation
    pending = promise
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: present(request)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
        DispatchQueue.main.async {
          guard let self, self.generation == request, self.pending != nil else { return }
          if allowed { self.present(request) } else { self.finish(error: "Allow Camera access in iPhone Settings to scan the laptop QR code, or enter its address and code manually.") }
        }
      }
    default: finish(error: "Allow Camera access in iPhone Settings to scan the laptop QR code, or enter its address and code manually.")
    }
  }
  func cancel() { finish() }
  private func present(_ request: Int) {
    guard generation == request, pending != nil,
      let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
      finish(error: "Open the app to scan the laptop pairing code."); return
    }
    var presenter = root
    while let shown = presenter.presentedViewController { presenter = shown }
    let next = LaptopQrController()
    next.completion = { [weak self] value, error in self?.finish(value: value, error: error) }
    next.modalPresentationStyle = .fullScreen
    controller = next
    presenter.present(next, animated: true)
  }
  private func finish(value: String? = nil, error: String? = nil) {
    guard let promise = pending else { return }
    generation += 1
    pending = nil
    controller?.completion = nil
    controller?.stop()
    controller?.dismiss(animated: true)
    controller = nil
    if let error { promise.reject("QR_SCAN_FAILED", error) } else { promise.resolve(value) }
  }
}

private final class LaptopQrController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  var completion: ((String?, String?) -> Void)?
  private let session = AVCaptureSession()
  private let cameraQueue = DispatchQueue(label: "org.openoutdoor.laptop-qr-camera")
  private var preview: AVCaptureVideoPreviewLayer?
  private let guidance = UILabel()
  private var finished = false
  private var cameraCancelled = false // Accessed only on cameraQueue.

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    view.layer.addSublayer(layer)
    preview = layer
    guidance.text = "Point the camera at the Open Outdoor pairing QR code on your laptop."
    guidance.textColor = .white
    guidance.backgroundColor = .black
    guidance.numberOfLines = 0
    guidance.font = .preferredFont(forTextStyle: .body)
    guidance.adjustsFontForContentSizeCategory = true
    guidance.translatesAutoresizingMaskIntoConstraints = false
    let close = UIButton(type: .system)
    close.setTitle("Cancel scan", for: .normal)
    close.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    close.titleLabel?.adjustsFontForContentSizeCategory = true
    close.tintColor = .white
    close.backgroundColor = .black
    close.accessibilityHint = "Close the camera and return to laptop connection"
    close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    close.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(guidance); view.addSubview(close)
    NSLayoutConstraint.activate([
      guidance.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
      guidance.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
      guidance.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
      close.leadingAnchor.constraint(equalTo: guidance.leadingAnchor),
      close.trailingAnchor.constraint(equalTo: guidance.trailingAnchor),
      close.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
      close.heightAnchor.constraint(greaterThanOrEqualToConstant: 56),
    ])
    cameraQueue.async { [weak self] in self?.start() }
  }
  override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds; preview?.connection?.videoOrientation = .portrait }
  override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); stop() }
  private func start() {
    guard !cameraCancelled else { return }
    do {
      guard let camera = AVCaptureDevice.default(for: .video) else { throw CameraError.unavailable }
      let input = try AVCaptureDeviceInput(device: camera)
      let output = AVCaptureMetadataOutput()
      session.beginConfiguration()
      guard session.canAddInput(input), session.canAddOutput(output) else { session.commitConfiguration(); throw CameraError.unavailable }
      session.addInput(input); session.addOutput(output)
      output.setMetadataObjectsDelegate(self, queue: .main)
      guard output.availableMetadataObjectTypes.contains(.qr) else { session.commitConfiguration(); throw CameraError.unavailable }
      output.metadataObjectTypes = [.qr]
      session.commitConfiguration()
      session.startRunning()
    } catch { DispatchQueue.main.async { [weak self] in self?.complete(nil, "The camera is unavailable. Enter the laptop address and code manually.") } }
  }
  func stop() { cameraQueue.async { [self] in cameraCancelled = true; if session.isRunning { session.stopRunning() } } }
  @objc private func cancel() { complete(nil, nil) }
  private func complete(_ value: String?, _ error: String?) {
    guard !finished else { return }
    finished = true
    stop()
    completion?(value, error)
  }
  func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
    guard !finished else { return }
    for object in metadataObjects {
      guard let raw = (object as? AVMetadataMachineReadableCodeObject)?.stringValue else { continue }
      guard raw.utf8.count <= 1024, let data = raw.data(using: .utf8),
        let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
        value["type"] as? String == "open-outdoor-laptop", value["version"] as? Int == 1,
        let address = value["address"] as? String, (try? OpenOutdoorLaptopEndpoint.url(address)) != nil,
        let code = value["pairingCode"] as? String, code.utf8.count == 32, code.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil else {
        guidance.text = "That QR code is not an Open Outdoor laptop pairing code. Scan the code on the laptop pairing page."
        continue
      }
      complete(raw, nil); return
    }
  }
  private enum CameraError: Error { case unavailable }
}
