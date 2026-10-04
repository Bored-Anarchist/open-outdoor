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

  static func connectionMessage(_ error: Error) -> String {
    let failure = error as NSError
    if failure.domain == NSURLErrorDomain {
      switch failure.code {
      case NSURLErrorTimedOut:
        return "Laptop connection timed out. Check its firewall and Wi-Fi, then try again."
      case NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost:
        return "Could not reach the laptop. Check its address, server and firewall."
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
