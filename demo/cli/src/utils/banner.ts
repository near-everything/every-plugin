import { gradients, colors, divider } from "./theme";

const ASCII_BOS = `
 ██████╗  ██████╗ ███████╗
 ██╔══██╗██╔═══██╗██╔════╝
 ██████╔╝██║   ██║███████╗
 ██╔══██╗██║   ██║╚════██║
 ██████╔╝╚██████╔╝███████║
 ╚═════╝  ╚═════╝ ╚══════╝`;

export function printBanner(title?: string, version = "1.0.0") {
  console.log(gradients.cyber(ASCII_BOS));
  console.log();
  if (title) {
    console.log(colors.dim(`  ${title} ${colors.cyan(`v${version}`)}`));
    console.log(colors.dim(`  ${divider(30)}`));
  }
  console.log();
}
