import Foundation

@main
private enum LaptopErrorTests {
  static func main() throws {
    let original: any JavaScriptThrowable = Exception(name: "LAPTOP_TRANSFER_FAILED", description: "Useful message", code: "LAPTOP_TRANSFER_FAILED")
    guard original.message.contains("undefined reason") else { throw failure("SDK behavior changed; review workaround") }
    for code in ["LAPTOP_TRANSFER_FAILED", "LAPTOP_CONNECT_FAILED", "LAPTOP_TRUST_FAILED", "QR_SCAN_FAILED", "QR_BUSY"] {
      let message = "Allow Local Network access and retry."
      let exception = OpenOutdoorLaptopException(code, message)
      let bridged: any JavaScriptThrowable = exception
      guard bridged.code == code, bridged.message == message,
        exception.reason == message, String(reflecting: exception) == message else {
        throw failure("Actionable error lost during JS bridging")
      }
    }
    for (code, expected) in [
      (NSURLErrorTimedOut, "timed out"),
      (NSURLErrorCannotConnectToHost, "firewall"),
      (NSURLErrorNotConnectedToInternet, "Local Network"),
      (NSURLErrorAppTransportSecurityRequiresSecureConnection, "latest Open Outdoor build")
    ] {
      let error = NSError(domain: NSURLErrorDomain, code: code, userInfo: [NSLocalizedDescriptionKey: "secret pairing header"])
      let message = OpenOutdoorLaptopException.connectionMessage(error)
      guard message.contains(expected), !message.contains("secret") else { throw failure("Incorrect connection guidance") }
    }
    print("Native laptop error bridge passed.")
  }

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "LaptopErrorTests", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
