// electron-builder's `extraResources` applies its own dependency-aware
// processing to any node_modules folder it copies, which silently dropped
// node_modules entirely from .next/standalone when copied that way (found
// by actually launching the packaged app and hitting "Cannot find module
// 'next'" — not something the build step itself warned about). A plain
// recursive copy in an afterPack hook is dumb but predictable: what's in
// .next/standalone on disk is exactly what ends up in the packaged app.
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const source = path.join(__dirname, "..", ".next", "standalone");
  const dest = path.join(context.appOutDir, resourcesDirName(context), "standalone");

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(source, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}data${path.sep}`) && !src.endsWith(".db") && !src.includes(".db-"),
  });

  console.log(`[afterPack] copied standalone server -> ${dest}`);
};

function resourcesDirName(context) {
  if (context.electronPlatformName === "darwin") {
    const productFilename = context.packager?.appInfo?.productFilename ?? "SpendWise";
    return `${productFilename}.app/Contents/Resources`;
  }
  return "resources";
}
