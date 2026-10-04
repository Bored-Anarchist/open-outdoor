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
    guard OpenOutdoorLaptopException.responseMessage(200) == nil else { throw failure("Successful HTTP response rejected") }
    for (status, expected) in [(401, "Pairing code rejected"), (403, "proxy or VPN"), (409, "state file changed"), (404, "unavailable")] {
      guard OpenOutdoorLaptopException.responseMessage(status)?.contains(expected) == true else { throw failure("Incorrect HTTP failure guidance") }
    }
    let timeout = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)
    guard OpenOutdoorLaptopException.connectionMessage(timeout).contains("iPhone Safari") else { throw failure("Missing independent reachability check") }
    print("Native laptop error bridge passed.")
  }

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "LaptopErrorTests", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
