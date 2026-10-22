const { withAndroidManifest, withDangerousMod, withInfoPlist } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function withCleartextTraffic(config) {
  config = withInfoPlist(config, (mod) => {
    const ats = mod.modResults.NSAppTransportSecurity ?? {};
    mod.modResults.NSAppTransportSecurity = {
      ...ats,
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
    };
    mod.modResults.NSLocalNetworkUsageDescription =
      "SIGVED se conecta a la estación de la causa en la red local para enviar solo los archivos que vos confirmes.";
    mod.modResults.ITSAppUsesNonExemptEncryption = false;
    return mod;
  });

  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/xml");
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, "network_security_config.xml"), NETWORK_SECURITY_CONFIG);
      return mod;
    },
  ]);

  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:usesCleartextTraffic"] = "true";
      application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    }
    return mod;
  });
}

module.exports = withCleartextTraffic;
