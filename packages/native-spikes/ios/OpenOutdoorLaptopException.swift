import ExpoModulesCore
import Foundation

/// Expo's string rejection sets description, while the JS bridge reads reason.
/// Keep the actionable message intact without exposing native source coordinates.
internal final class OpenOutdoorLaptopException: Exception, @unchecked Sendable {
  private let failureCode: String
  private let failureMessage: String

  init(_ code: String, _ message: String) {
    failureCode = code
    failureMessage = message
    super.init()
  }

  override var code: String { failureCode }
  override var reason: String { failureMessage }
  override var debugDescription: String { failureMessage }
  var message: String { failureMessage }

  static func responseMessage(_ status: Int) -> String? {
    switch status {
    case 200: return nil
    case 301, 302, 303, 307, 308: return "The laptop redirected the connection. Use the address shown in its terminal."
    case 401: return "Pairing code rejected. Reconnect using the code currently shown on the laptop."
    case 403: return "The laptop refused this connection. Use its current Wi-Fi address and check proxy or VPN settings."
    case 409: return "The laptop's state file changed. Restore the package on the laptop, restart its server and reconnect."
    default: return "The state package is unavailable. Check the laptop server and reconnect."
    }
  }

  static func connectionMessage(_ error: Error) -> String {
    let failure = error as NSError
    if failure.domain == NSURLErrorDomain {
      switch failure.code {
      case NSURLErrorTimedOut:
        return "Laptop connection timed out. Open its address with /v1/catalog in iPhone Safari. If Safari cannot load it, check the laptop server, firewall, VPN and Wi-Fi device isolation."
      case NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost:
        return "Could not reach the laptop. Check its current Wi-Fi address, running server and firewall. Open its address with /v1/catalog in iPhone Safari to check reachability."
      case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
        return "Check Wi-Fi and allow Open Outdoor in iPhone Settings → Privacy & Security → Local Network."
      case NSURLErrorAppTransportSecurityRequiresSecureConnection:
        return "iOS blocked this laptop address. Install the latest Open Outdoor build and try again."
      default: break
      }
    }
    return "Could not reach the laptop. Check Wi-Fi, its server and firewall, and allow Local Network access in iPhone Settings."
  }
}
