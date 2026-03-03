declare module '@iarna/rtf-to-html' {
  import { Readable } from 'stream';

  interface RtfToHtmlOptions {
    template?: (doc: any, defaults: any, content: string) => string;
  }

  function fromStream(
    stream: Readable,
    options: RtfToHtmlOptions,
    cb: (err: Error | null, html: string) => void,
  ): void;

  function fromString(
    rtfContent: string,
    options: RtfToHtmlOptions,
    cb: (err: Error | null, html: string) => void,
  ): void;

  export { fromStream, fromString };
}
