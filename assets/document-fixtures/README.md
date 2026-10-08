# Synthetic document fixtures

These small fixtures contain no personal or third-party document content. `rgb.png`, `rgba.png`, and `rgb.jpg` exercise color, alpha and JPEG embedding. `cmyk.jpg` is a negative color-space fixture. `encrypted.pdf` is a synthetic encrypted document with test-only password `test-only-password`; production rejects it without requesting a password.

They are also bundled for the opt-in `--background-documents-spike` diagnostic mode. That mode writes only synthetic outputs into the explicitly supplied directory and does not start the companion or providers.
