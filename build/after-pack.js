const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.projectDir;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(projectDir, "src", "assets", "app-icon.ico");
  const rceditPath = path.join(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
  const appName = context.packager.appInfo.productName;
  const version = context.packager.appInfo.version;

  execFileSync(
    rceditPath,
    [
      exePath,
      "--set-icon", iconPath,
      "--set-version-string", "CompanyName", "fake-Wittem",
      "--set-version-string", "FileDescription", appName,
      "--set-version-string", "ProductName", appName,
      "--set-version-string", "InternalName", appName,
      "--set-version-string", "OriginalFilename", `${appName}.exe`,
      "--set-file-version", version,
      "--set-product-version", version
    ],
    { stdio: "inherit" }
  );
};
