/**
 * An error whose message is safe to send straight to the client.
 *
 * Ordinary errors get logged in full server-side and reduced to a generic
 * message in the response, so a stray internal detail (a file path, a
 * database column) never leaks. A ConfigurationError is the deliberate
 * exception: it exists specifically to tell whoever is *deploying* the app
 * what to fix, and that message is exactly what belongs on screen.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
