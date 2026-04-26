# Android app

## Release signing

Android release APKs must be signed before they can be installed. The `Android Release` GitHub Actions workflow reads signing credentials from repository secrets:

| Secret | Description |
| --- | --- |
| `ANDROID_SIGNING_KEYSTORE_BASE64` | Base64-encoded JKS or keystore file |
| `ANDROID_SIGNING_STORE_PASSWORD` | Keystore password |
| `ANDROID_SIGNING_KEY_ALIAS` | Release key alias |
| `ANDROID_SIGNING_KEY_PASSWORD` | Release key password |

Create a release keystore locally, keep it somewhere private, and add the base64-encoded file contents to GitHub secrets:

```bash
keytool -genkeypair \
  -v \
  -keystore storybook-release.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias storybook

base64 -w 0 storybook-release.jks
```

On macOS, use `base64 -i storybook-release.jks | tr -d '\n'` instead of `base64 -w 0`.

Use the same keystore for every Android release. Android will reject app updates that use a different signing key.
