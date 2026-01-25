const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

const OSC_START = "\x1b]8;;";
const OSC_END = "\x07";
const OSC_RESET = "\x1b]8;;\x07";

export const linkify = (text: string): string => {
  return text.replace(URL_REGEX, (url) => {
    return `${OSC_START}${url}${OSC_END}${url}${OSC_RESET}`;
  });
};
