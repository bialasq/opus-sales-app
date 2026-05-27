declare module "pdfkit" {
  import { Readable } from "stream";

  interface PDFDocumentOptions {
    size?: string;
    margin?: number;
  }

  interface TextOptions {
    align?: string;
    underline?: boolean;
    oblique?: boolean;
  }

  class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);
    fontSize(size: number): this;
    text(text: string, options?: TextOptions): this;
    moveDown(lines?: number): this;
    addPage(): this;
    end(): void;
    pipe<T extends NodeJS.WritableStream>(destination: T): T;
  }

  export = PDFDocument;
}
