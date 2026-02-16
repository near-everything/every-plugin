import { colors, divider, gradients } from "./theme";

const ASCII_BOS = `
  ██████╗  ██████╗ ███████╗
  ██╔══██╗██╔═══██╗██╔════╝
  ██████╔╝██║   ██║███████╗
  ██╔══██╗██║   ██║╚════██║
  ██████╔╝╚██████╔╝███████║
  ╚═════╝  ╚═════╝ ╚══════╝`;

export function printBanner(title = "everything-dev", version = "1.0.0") {
	console.log(gradients.cyber(ASCII_BOS));
	console.log();
	console.log(colors.dim(`  ${title} ${colors.cyan(`v${version}`)}`));
	console.log(colors.dim(`  ${divider(30)}`));
	console.log();
}
